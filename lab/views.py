from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Avg, Count, Prefetch, Q
from django.db.models.functions import TruncMonth, TruncWeek
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .audit import log_action
from .models import (
    AuditLog,
    Category,
    CommitteeRating,
    ExpiryUnit,
    Ingredient,
    IngredientPriceHistory,
    MealTrial,
    ProductEvaluation,
    Role,
    Supplier,
    TrialProductStatus,
    UserProfile,
    Verdict,
)
from .permissions import (
    IsAuthenticatedReadOrWriteRole,
    can_clear_data,
    can_manage_secret_access,
    can_manage_users,
    can_view_audit,
    can_write,
    is_admin,
    user_role,
    visible_ingredients_q,
)
from .serializers import (
    AuditLogSerializer,
    CategorySerializer,
    CommitteeRatingSerializer,
    IngredientDetailSerializer,
    IngredientListSerializer,
    MealTrialDetailSerializer,
    MealTrialListSerializer,
    ProductEvaluationSerializer,
    PublicTrialSerializer,
    SupplierSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .utils import (
    expire_overdue_trials,
    next_ingredient_code,
    next_trial_code,
    sync_approved_trial_to_product,
    sync_trial_ratings_from_committee,
    trial_archive_q,
    unsync_trial_from_products,
)


def _profile(user):
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"display_name": user.get_full_name() or user.username, "role": Role.STAFF},
    )
    return profile


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedReadOrWriteRole]

    def perform_create(self, serializer):
        obj = serializer.save()
        log_action(
            request=self.request,
            action="create",
            entity_type="category",
            entity_id=obj.id,
            summary=f"Created category {obj.name}",
        )

    def perform_destroy(self, instance):
        log_action(
            request=self.request,
            action="delete",
            entity_type="category",
            entity_id=instance.id,
            summary=f"Deleted category {instance.name}",
        )
        instance.delete()


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticatedReadOrWriteRole]

    def get_queryset(self):
        return Supplier.objects.annotate(ingredient_count=Count("ingredients"))

    def perform_create(self, serializer):
        obj = serializer.save()
        log_action(
            request=self.request,
            action="create",
            entity_type="supplier",
            entity_id=obj.id,
            summary=f"Created supplier {obj.company_name}",
        )

    def perform_update(self, serializer):
        obj = serializer.save()
        log_action(
            request=self.request,
            action="update",
            entity_type="supplier",
            entity_id=obj.id,
            summary=f"Updated supplier {obj.company_name}",
        )

    def perform_destroy(self, instance):
        log_action(
            request=self.request,
            action="delete",
            entity_type="supplier",
            entity_id=instance.id,
            summary=f"Deleted supplier {instance.company_name}",
        )
        instance.delete()


class IngredientViewSet(viewsets.ModelViewSet):
    queryset = Ingredient.objects.select_related("category", "supplier").prefetch_related(
        "price_history", "alternatives"
    )
    permission_classes = [IsAuthenticatedReadOrWriteRole]

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return IngredientDetailSerializer
        return IngredientListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        tab = self.request.query_params.get("tab")
        if tab == "trial":
            qs = qs.filter(is_trial=True)
        elif tab == "approved":
            qs = qs.filter(is_trial=False)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)
        supplier = self.request.query_params.get("supplier")
        if supplier:
            qs = qs.filter(supplier_id=supplier)
        status_filter = self.request.query_params.get("status")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(batch_number__icontains=search)
            )
        visibility = visible_ingredients_q(self.request.user)
        if visibility:
            qs = qs.filter(visibility).distinct()
        ingredients = list(qs)
        if status_filter:
            ingredients = [i for i in ingredients if i.expiry_status == status_filter]
            return Ingredient.objects.filter(id__in=[i.id for i in ingredients]).select_related(
                "category", "supplier"
            )
        return qs

    def _strip_secret_if_needed(self, validated_data):
        # Viewers are read-only; writers may mark secrets.
        # Visibility of secret ingredients is Admin/IT or Admin-granted users.
        if not can_write(self.request.user):
            validated_data.pop("is_secret", None)
            validated_data.pop("secret_viewers", None)
            return
        # Only Admin may assign who can see a secret ingredient
        if not can_manage_secret_access(self.request.user):
            validated_data.pop("secret_viewers", None)

    def _require_password_to_mark_secret(self, making_secret):
        """Re-enter password when newly marking an ingredient as secret."""
        if not making_secret:
            return
        password = self.request.data.get("confirm_password") or ""
        if not password or not self.request.user.check_password(password):
            raise ValidationError(
                {"confirm_password": "Enter your password to mark this as a secret ingredient."}
            )

    def perform_create(self, serializer):
        self._strip_secret_if_needed(serializer.validated_data)
        self._require_password_to_mark_secret(bool(serializer.validated_data.get("is_secret")))
        category = serializer.validated_data.get("category")
        if category:
            code = next_ingredient_code(category)
        else:
            other = Category.objects.filter(code_prefix="OT").first()
            code = next_ingredient_code(other) if other else "OT-0001"
        ingredient = serializer.save(
            code=code,
            is_trial=True,
            trial_status=TrialProductStatus.TESTING,
        )
        if ingredient.price_per_unit:
            IngredientPriceHistory.objects.create(
                ingredient=ingredient,
                price=ingredient.price_per_unit,
                recorded_at=timezone.localdate(),
            )
        log_action(
            request=self.request,
            action="create",
            entity_type="ingredient",
            entity_id=ingredient.id,
            summary=f"Created ingredient {ingredient.code} {ingredient.name}",
        )

    def perform_update(self, serializer):
        self._strip_secret_if_needed(serializer.validated_data)
        instance = self.get_object()
        becoming_secret = bool(serializer.validated_data.get("is_secret", instance.is_secret)) and not instance.is_secret
        self._require_password_to_mark_secret(becoming_secret)
        old_price = instance.price_per_unit
        ingredient = serializer.save()
        new_price = ingredient.price_per_unit
        if old_price != new_price:
            IngredientPriceHistory.objects.create(
                ingredient=ingredient,
                price=old_price,
                recorded_at=timezone.localdate(),
            )
        if hasattr(ingredient, "_prefetched_objects_cache"):
            ingredient._prefetched_objects_cache.clear()
        log_action(
            request=self.request,
            action="update",
            entity_type="ingredient",
            entity_id=ingredient.id,
            summary=f"Updated ingredient {ingredient.code} {ingredient.name}",
        )
        return ingredient

    def perform_destroy(self, instance):
        log_action(
            request=self.request,
            action="delete",
            entity_type="ingredient",
            entity_id=instance.id,
            summary=f"Deleted ingredient {instance.code} {instance.name}",
        )
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        ingredient = self.get_object()
        ingredient.is_trial = False
        ingredient.trial_status = TrialProductStatus.APPROVED
        ingredient.rejection_reason = ""
        ingredient.rejection_notes = ""
        ingredient.save()
        log_action(
            request=request,
            action="approve",
            entity_type="ingredient",
            entity_id=ingredient.id,
            summary=f"Approved ingredient {ingredient.code}",
        )
        return Response(IngredientDetailSerializer(ingredient, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def upload_photo(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        ingredient = self.get_object()
        file = request.FILES.get("photo")
        if not file:
            return Response({"detail": "No photo uploaded."}, status=400)
        ingredient.photo = file
        ingredient.save()
        return Response(IngredientDetailSerializer(ingredient, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        ingredient = self.get_object()
        ingredient.is_trial = True
        ingredient.trial_status = TrialProductStatus.REJECTED
        ingredient.rejection_reason = request.data.get("rejection_reason", "other")
        ingredient.rejection_notes = request.data.get("rejection_notes", "")
        ingredient.save()
        log_action(
            request=request,
            action="reject",
            entity_type="ingredient",
            entity_id=ingredient.id,
            summary=f"Rejected ingredient {ingredient.code}",
        )
        return Response(IngredientDetailSerializer(ingredient, context={"request": request}).data)


class MealTrialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedReadOrWriteRole]

    def get_queryset(self):
        expire_overdue_trials()
        qs = MealTrial.objects.select_related("supplier").prefetch_related(
            "recipe_lines__ingredient",
            "prep_steps",
            "ingredients",
            "committee_ratings",
        ).annotate(
            ingredient_count=Count("ingredients", distinct=True),
            committee_count=Count("committee_ratings", distinct=True),
        ).order_by("-trial_date", "-id")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(code__icontains=search))
        verdict = self.request.query_params.get("verdict")
        if verdict:
            qs = qs.filter(verdict=verdict)
        if self.action == "list":
            archived = self.request.query_params.get("archived", "false")
            if archived == "true":
                qs = qs.filter(trial_archive_q())
            elif archived != "all":
                qs = qs.exclude(trial_archive_q())
        return qs

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return MealTrialDetailSerializer
        return MealTrialListSerializer

    def perform_create(self, serializer):
        trial = serializer.save(code=next_trial_code())
        log_action(
            request=self.request,
            action="create",
            entity_type="trial",
            entity_id=trial.id,
            summary=f"Created trial {trial.code} {trial.title}",
        )

    def perform_update(self, serializer):
        trial = serializer.save()
        log_action(
            request=self.request,
            action="update",
            entity_type="trial",
            entity_id=trial.id,
            summary=f"Updated trial {trial.code} {trial.title}",
        )

    def perform_destroy(self, instance):
        log_action(
            request=self.request,
            action="delete",
            entity_type="trial",
            entity_id=instance.id,
            summary=f"Deleted trial {instance.code} {instance.title}",
        )
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        trial = self.get_object()
        if trial.expiry_status == "expired":
            return Response(
                {"detail": "Expired trials cannot be approved."},
                status=400,
            )
        trial.verdict = Verdict.SUITABLE
        trial.rejection_reason = ""
        trial.rejection_notes = ""
        trial.save()
        sync_approved_trial_to_product(trial)
        log_action(
            request=request,
            action="approve",
            entity_type="trial",
            entity_id=trial.id,
            summary=f"Approved trial {trial.code}",
        )
        return Response(MealTrialDetailSerializer(trial, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        trial = self.get_object()
        if trial.expiry_status == "expired":
            return Response(
                {"detail": "Expired trials cannot be rejected."},
                status=400,
            )
        trial.verdict = Verdict.NOT_SUITABLE
        trial.rejection_reason = request.data.get("rejection_reason", "other")
        trial.rejection_notes = request.data.get("rejection_notes", "")
        trial.save()
        unsync_trial_from_products(trial)
        log_action(
            request=request,
            action="reject",
            entity_type="trial",
            entity_id=trial.id,
            summary=f"Rejected trial {trial.code}",
        )
        return Response(MealTrialDetailSerializer(trial, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def upload_photo(self, request, pk=None):
        if not can_write(request.user):
            return Response({"detail": "Read-only role."}, status=403)
        trial = self.get_object()
        field = request.data.get("field", "final_dish_photo")
        file = request.FILES.get("photo")
        if not file:
            return Response({"detail": "No photo uploaded."}, status=400)
        if field not in ("photo", "final_dish_photo"):
            field = "final_dish_photo"
        setattr(trial, field, file)
        trial.save()
        return Response(MealTrialDetailSerializer(trial, context={"request": request}).data)


class ProductEvaluationViewSet(viewsets.ModelViewSet):
    serializer_class = ProductEvaluationSerializer
    permission_classes = [IsAuthenticatedReadOrWriteRole]

    def get_queryset(self):
        return (
            ProductEvaluation.objects.prefetch_related(
                Prefetch(
                    "ingredients",
                    queryset=Ingredient.objects.select_related("category").only(
                        "id", "code", "name", "category_id"
                    ),
                ),
                Prefetch(
                    "trials",
                    queryset=MealTrial.objects.only("id", "code", "title", "selling_price"),
                ),
            )
            .order_by("-updated_at", "-id")
        )

    def perform_create(self, serializer):
        obj = serializer.save()
        log_action(
            request=self.request,
            action="create",
            entity_type="product",
            entity_id=obj.id,
            summary=f"Created product {obj.product_name}",
        )

    def perform_update(self, serializer):
        obj = serializer.save()
        log_action(
            request=self.request,
            action="update",
            entity_type="product",
            entity_id=obj.id,
            summary=f"Updated product {obj.product_name}",
        )

    def perform_destroy(self, instance):
        log_action(
            request=self.request,
            action="delete",
            entity_type="product",
            entity_id=instance.id,
            summary=f"Deleted product {instance.product_name}",
        )
        instance.delete()


class LabUserViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        users = User.objects.select_related("profile").filter(is_active=True).exclude(username="AnonymousUser")
        return Response(UserSerializer(users, many=True).data)

    def retrieve(self, request, pk=None):
        user = User.objects.get(pk=pk)
        return Response(UserSerializer(user).data)

    def create(self, request):
        if not can_manage_users(request.user):
            return Response({"detail": "IT only."}, status=status.HTTP_403_FORBIDDEN)
        ser = UserWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        password = data.get("password") or "changeme123"
        user = User.objects.create_user(
            username=data["email"],
            email=data["email"],
            password=password,
        )
        UserProfile.objects.create(
            user=user, display_name=data["display_name"], role=data["role"]
        )
        log_action(
            request=request,
            action="create",
            entity_type="user",
            entity_id=user.id,
            summary=f"Created user {user.email} ({data['role']})",
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        if not can_manage_users(request.user):
            return Response({"detail": "IT only."}, status=status.HTTP_403_FORBIDDEN)
        user = User.objects.get(pk=pk)
        profile = _profile(user)
        if "display_name" in request.data:
            profile.display_name = request.data["display_name"]
        if "role" in request.data:
            profile.role = request.data["role"]
        profile.save()
        if request.data.get("email"):
            user.email = request.data["email"]
            user.username = request.data["email"]
            user.save()
        if request.data.get("password"):
            user.set_password(request.data["password"])
            user.save()
        log_action(
            request=request,
            action="update",
            entity_type="user",
            entity_id=user.id,
            summary=f"Updated user {user.email}",
        )
        return Response(UserSerializer(user).data)

    def destroy(self, request, pk=None):
        if not can_manage_users(request.user):
            return Response({"detail": "IT only."}, status=status.HTTP_403_FORBIDDEN)
        if str(request.user.id) == str(pk):
            return Response({"detail": "You cannot delete your own account."}, status=400)
        user = User.objects.get(pk=pk)
        email = user.email
        user.delete()
        log_action(
            request=request,
            action="delete",
            entity_type="user",
            entity_id=pk,
            summary=f"Deleted user {email}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""
    if not email or not password:
        return Response({"detail": "Please fill in all fields."}, status=400)
    user = User.objects.filter(email__iexact=email).first()
    if not user or not user.check_password(password):
        user = User.objects.filter(username__iexact=email).first()
    if not user or not user.check_password(password):
        return Response({"detail": "Invalid email or password."}, status=400)
    refresh = RefreshToken.for_user(user)
    log_action(
        request=request,
        user=user,
        action="login",
        entity_type="user",
        entity_id=user.id,
        summary=f"User logged in ({user.email})",
    )
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        }
    )


@api_view(["GET"])
def me_view(request):
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
def dashboard_view(request):
    expire_overdue_trials()
    today = timezone.localdate()
    ingredients = Ingredient.objects.select_related("category", "supplier")
    visibility = visible_ingredients_q(request.user)
    if visibility:
        ingredients = ingredients.filter(visibility).distinct()
    trials = MealTrial.objects.all()
    success_avg = (
        trials.exclude(verdict=Verdict.PENDING).aggregate(avg=Avg("success_rate"))["avg"] or 0
    )

    low_stock = [
        IngredientListSerializer(i, context={"request": request}).data
        for i in ingredients
        if i.is_low_stock
    ]

    recent = MealTrialListSerializer(
        trials.exclude(trial_archive_q())
        .select_related("supplier")
        .prefetch_related("committee_ratings")
        .annotate(ingredient_count=Count("ingredients"))
        .order_by("-trial_date", "-id")[:8],
        many=True,
    ).data

    now = timezone.now()
    expiring_window = Q(expiry_unit=ExpiryUnit.HOURS, expires_at__lte=now + timedelta(hours=5)) | (
        ~Q(expiry_unit=ExpiryUnit.HOURS) & Q(expires_at__lte=now + timedelta(days=1))
    )
    expiring_trials_qs = (
        trials.exclude(trial_archive_q())
        .filter(expires_at__isnull=False, expires_at__gt=now)
        .filter(expiring_window)
        .select_related("supplier")
        .prefetch_related("committee_ratings")
        .annotate(ingredient_count=Count("ingredients", distinct=True))
        .order_by("expires_at")
    )
    expiring_trials = MealTrialListSerializer(
        expiring_trials_qs, many=True, context={"request": request}
    ).data

    trial_years = {
        y
        for y in trials.exclude(trial_date__isnull=True).dates("trial_date", "year")
        if y
    }
    available_years = sorted({d.year for d in trial_years} | {today.year}, reverse=True)
    earliest_year = min(available_years) if available_years else today.year

    MONTH_LABELS = (
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    )

    def _monday_of(day):
        return day - timedelta(days=day.weekday())

    def _parse_grain(value):
        return value if value in ("year", "month", "week") else "week"

    def _year_bounds(year):
        start = date(year, 1, 1)
        end = min(date(year, 12, 31), today) if year == today.year else date(year, 12, 31)
        if end < start:
            end = start
        return start, end

    def _month_bounds(year, month):
        start = date(year, month, 1)
        if month == 12:
            end = date(year, 12, 31)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
        if year == today.year and month == today.month:
            end = today
        if end < start:
            end = start
        return start, end

    def _week_bounds(start):
        end = start + timedelta(days=6)
        if end > today:
            end = today
        if end < start:
            end = start
        return start, end

    def _chart_months():
        options = []
        year = earliest_year
        while year <= today.year:
            last_month = today.month if year == today.year else 12
            for month in range(1, last_month + 1):
                value = f"{year:04d}-{month:02d}"
                options.append(
                    {
                        "value": value,
                        "label": f"{MONTH_LABELS[month - 1]} {year}",
                    }
                )
            year += 1
        options.reverse()
        return options

    def _chart_weeks():
        options = []
        week_start = _monday_of(today)
        earliest = date(earliest_year, 1, 1)
        while week_start >= earliest and len(options) < 52:
            week_end = min(week_start + timedelta(days=6), today)
            if week_start.year == week_end.year and week_start.month == week_end.month:
                label = f"{week_start.day}–{week_end.day} {MONTH_LABELS[week_start.month - 1]}"
            elif week_start.year == week_end.year:
                label = (
                    f"{week_start.day} {MONTH_LABELS[week_start.month - 1]}"
                    f" – {week_end.day} {MONTH_LABELS[week_end.month - 1]}"
                )
            else:
                label = (
                    f"{week_start.day} {MONTH_LABELS[week_start.month - 1]} {week_start.year}"
                    f" – {week_end.day} {MONTH_LABELS[week_end.month - 1]} {week_end.year}"
                )
            options.append({"value": week_start.isoformat(), "label": label})
            week_start -= timedelta(days=7)
        return options

    chart_months = _chart_months()
    chart_weeks = _chart_weeks()
    month_values = {opt["value"] for opt in chart_months}
    week_values = {opt["value"] for opt in chart_weeks}
    default_month = f"{today.year:04d}-{today.month:02d}"
    default_week = _monday_of(today).isoformat()

    def _parse_period(grain, value):
        raw = (value or "").strip()
        if grain == "year":
            try:
                year = int(raw)
            except (TypeError, ValueError):
                return str(today.year)
            return str(year if year in available_years else today.year)
        if grain == "month":
            if raw in month_values:
                return raw
            return default_month if default_month in month_values else (chart_months[0]["value"] if chart_months else default_month)
        if raw in week_values:
            return raw
        return default_week if default_week in week_values else (chart_weeks[0]["value"] if chart_weeks else default_week)

    def _annotate_counts(qs):
        return qs.annotate(
            count=Count("id"),
            approved=Count("id", filter=Q(verdict=Verdict.SUITABLE)),
            rejected=Count("id", filter=Q(verdict=Verdict.NOT_SUITABLE)),
        )

    def _daily_range(start, end):
        rows = _annotate_counts(
            trials.filter(trial_date__gte=start, trial_date__lte=end).values("trial_date")
        )
        by_date = {row["trial_date"]: row for row in rows}
        out = []
        day = start
        while day <= end:
            row = by_date.get(day) or {}
            out.append(
                {
                    "date": day.isoformat(),
                    "count": row.get("count", 0),
                    "approved": row.get("approved", 0),
                    "rejected": row.get("rejected", 0),
                }
            )
            day += timedelta(days=1)
        return out

    def _month_series(year):
        start, end = _year_bounds(year)
        rows = _annotate_counts(
            trials.filter(trial_date__gte=start, trial_date__lte=end)
            .annotate(month=TruncMonth("trial_date"))
            .values("month")
        )
        by_month = {}
        for row in rows:
            key = row["month"]
            if hasattr(key, "date"):
                key = key.date()
            by_month[date(key.year, key.month, 1)] = row
        out = []
        month = date(year, 1, 1)
        while month <= end:
            row = by_month.get(month) or {}
            out.append(
                {
                    "date": month.isoformat(),
                    "count": row.get("count", 0),
                    "approved": row.get("approved", 0),
                    "rejected": row.get("rejected", 0),
                }
            )
            if month.month == 12:
                break
            month = date(year, month.month + 1, 1)
        return out

    def _series_for(grain, period):
        if grain == "year":
            return _month_series(int(period))
        if grain == "month":
            year, month = period.split("-")
            start, end = _month_bounds(int(year), int(month))
            return _daily_range(start, end)
        start = date.fromisoformat(period)
        start, end = _week_bounds(start)
        return _daily_range(start, end)

    trials_grain = _parse_grain(request.query_params.get("trials_grain"))
    verdicts_grain = _parse_grain(request.query_params.get("verdicts_grain"))
    trials_period = _parse_period(trials_grain, request.query_params.get("trials_period") or request.query_params.get("trials_year"))
    verdicts_period = _parse_period(verdicts_grain, request.query_params.get("verdicts_period") or request.query_params.get("verdicts_year"))

    if trials_grain == verdicts_grain and trials_period == verdicts_period:
        shared = _series_for(trials_grain, trials_period)
        timeline = verdicts_over_time = shared
    else:
        timeline = _series_for(trials_grain, trials_period)
        verdicts_over_time = _series_for(verdicts_grain, verdicts_period)

    duration_by_week = []
    week_rows = (
        trials.filter(trial_date__isnull=False, cooking_duration__isnull=False)
        .annotate(week=TruncWeek("trial_date"))
        .values("week")
        .annotate(duration=Avg("cooking_duration"))
        .order_by("week")
    )
    for row in list(week_rows)[-12:]:
        week = row["week"]
        if hasattr(week, "date"):
            week = week.date()
        duration_by_week.append({"date": week.isoformat(), "duration": round(row["duration"] or 0)})

    recent_products = []
    for product in ProductEvaluation.objects.prefetch_related("ingredients").order_by("-created_at", "-id")[:8]:
        ingredients_list = list(product.ingredients.all())
        recent_products.append(
            {
                "id": product.id,
                "product_name": product.product_name,
                "created_at": product.created_at.isoformat() if product.created_at else None,
                "avg_success_rate": product.avg_success_rate,
                "avg_rating": product.avg_rating,
                "ingredient_titles": [{"id": i.id, "name": i.name} for i in ingredients_list],
            }
        )

    return Response(
        {
            "totals": {
                "ingredients": ingredients.filter(is_trial=False).count(),
                "suppliers": Supplier.objects.count(),
                "trials": trials.count(),
                "success_rate": round(success_avg, 1),
                "today_trials": trials.filter(trial_date=today).count(),
                "expiring_trials": len(expiring_trials),
            },
            "low_stock": low_stock,
            "recent_trials": recent,
            "expiring_trials": expiring_trials,
            "trials_over_time": timeline,
            "verdicts_over_time": verdicts_over_time,
            "chart_years": available_years,
            "chart_months": chart_months,
            "chart_weeks": chart_weeks,
            "trials_grain": trials_grain,
            "verdicts_grain": verdicts_grain,
            "trials_period": trials_period,
            "verdicts_period": verdicts_period,
            "duration_by_week": duration_by_week,
            "recent_products": recent_products,
        }
    )


@api_view(["GET"])
def reports_view(request):
    expire_overdue_trials()
    qs = MealTrial.objects.select_related("supplier").prefetch_related("ingredients__category")
    date_from = request.query_params.get("from")
    date_to = request.query_params.get("to")
    category = request.query_params.get("category")
    supplier = request.query_params.get("supplier")
    verdict = request.query_params.get("verdict")
    if date_from:
        qs = qs.filter(trial_date__gte=date_from)
    if date_to:
        qs = qs.filter(trial_date__lte=date_to)
    if category:
        qs = qs.filter(ingredients__category_id=category).distinct()
    if supplier:
        qs = qs.filter(supplier_id=supplier)
    if verdict:
        qs = qs.filter(verdict=verdict)

    rows = []
    for t in qs:
        scores = [t.taste, t.texture, t.cost, t.consistency, t.overall]
        scores = [s for s in scores if s]
        rows.append(
            {
                "id": t.id,
                "code": t.code,
                "title": t.title,
                "date": t.trial_date.isoformat() if t.trial_date else None,
                "conducted_by": t.conducted_by,
                "ingredients": [i.name for i in t.ingredients.all()],
                "success_rate": t.success_rate,
                "verdict": t.verdict,
                "rating": round(sum(scores) / len(scores), 2) if scores else 0,
                "expires_at": t.expires_at.isoformat() if t.expires_at else None,
                "expiry_status": t.expiry_status,
                "expiry_remaining_label": t.expiry_remaining_label,
                "notes": t.notes,
            }
        )
    suitable = sum(1 for r in rows if r["verdict"] == Verdict.SUITABLE)
    avg_success = round(sum(r["success_rate"] for r in rows) / len(rows), 1) if rows else 0
    return Response(
        {
            "rows": rows,
            "summary": {
                "total_trials": len(rows),
                "avg_success_rate": avg_success,
                "suitable": suitable,
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_trial_view(request, pk):
    expire_overdue_trials()
    try:
        trial = MealTrial.objects.get(pk=pk)
    except MealTrial.DoesNotExist:
        return Response({"detail": "Trial not found."}, status=404)
    return Response(PublicTrialSerializer(trial, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def public_committee_submit(request, pk):
    expire_overdue_trials()
    try:
        trial = MealTrial.objects.get(pk=pk)
    except MealTrial.DoesNotExist:
        return Response({"detail": "Trial not found."}, status=404)
    if trial.expiry_status == "expired":
        return Response(
            {"detail": "This trial has expired and can no longer be evaluated."},
            status=400,
        )
    data = {
        "trial": trial.id,
        "member_name": request.data.get("member_name", ""),
        "taste": request.data.get("taste", 0),
        "texture": request.data.get("texture", 0),
        "cost": request.data.get("cost", 0),
        "consistency": request.data.get("consistency", 0),
        "overall": request.data.get("overall", 0),
        "notes": request.data.get("notes", ""),
    }
    ser = CommitteeRatingSerializer(data=data)
    ser.is_valid(raise_exception=True)
    ser.save()
    sync_trial_ratings_from_committee(trial)
    return Response(ser.data, status=201)


@api_view(["GET"])
def trial_committee_ratings(request, pk):
    ratings = CommitteeRating.objects.filter(trial_id=pk)
    return Response(CommitteeRatingSerializer(ratings, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_logs_view(request):
    if not can_view_audit(request.user):
        return Response({"detail": "Admin or IT only."}, status=403)
    qs = AuditLog.objects.select_related("actor", "actor__profile").all()
    action = request.query_params.get("action")
    if action:
        qs = qs.filter(action=action)
    entity_type = request.query_params.get("entity_type")
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(summary__icontains=search)
            | Q(actor__email__icontains=search)
            | Q(entity_id__icontains=search)
        )
    limit = min(int(request.query_params.get("limit") or 200), 500)
    return Response(AuditLogSerializer(qs[:limit], many=True).data)


@api_view(["POST"])
def clear_all_data(request):
    if not can_clear_data(request.user):
        return Response({"detail": "Admin only."}, status=403)
    log_action(
        request=request,
        action="clear_data",
        entity_type="system",
        summary="Cleared all operational data",
    )
    CommitteeRating.objects.all().delete()
    ProductEvaluation.objects.all().delete()
    MealTrial.objects.all().delete()
    IngredientPriceHistory.objects.all().delete()
    Ingredient.objects.all().delete()
    Supplier.objects.all().delete()
    return Response({"detail": "Operational data cleared. Re-run seed_lab to restore demo data."})
