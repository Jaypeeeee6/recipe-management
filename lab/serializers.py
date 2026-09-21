from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    AuditLog,
    Category,
    CommitteeRating,
    Ingredient,
    IngredientPriceHistory,
    LabSettings,
    MealTrial,
    PrepStep,
    ProductEvaluation,
    RecipeLine,
    Role,
    Supplier,
    UserProfile,
)
from .permissions import (
    can_clear_data,
    can_manage_lab_settings,
    can_manage_secret_access,
    can_manage_users,
    can_see_secrets,
    can_view_audit,
    can_write,
)
from .utils import (
    trial_cost_summary,
    sync_approved_trial_to_product,
    refresh_product_averages,
    trial_archive_reasons,
    committee_rating_summary,
    member_rating_average,
)


class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="profile.role")
    display_name = serializers.CharField(source="profile.display_name")
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "display_name", "role", "date_joined", "permissions"]

    def get_permissions(self, obj):
        return {
            "can_write": can_write(obj),
            "can_see_secrets": can_see_secrets(obj),
            "can_manage_users": can_manage_users(obj),
            "can_manage_secret_access": can_manage_secret_access(obj),
            "can_manage_lab_settings": can_manage_lab_settings(obj),
            "can_view_audit": can_view_audit(obj),
            "can_clear_data": can_clear_data(obj),
        }


class LabSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabSettings
        fields = [
            "expiry_alert_email",
            "expiry_alerts_enabled",
            "last_expiry_alert_run",
            "updated_at",
        ]
        read_only_fields = ["last_expiry_alert_run", "updated_at"]

    def validate_expiry_alert_email(self, value):
        import re

        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email

        raw = value or ""
        parts = [p.strip() for p in re.split(r"[\s,;]+", raw) if p.strip()]
        if not parts:
            return ""
        cleaned = []
        seen = set()
        for part in parts:
            try:
                validate_email(part)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(f"Invalid email: {part}") from exc
            key = part.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(part)
        return ", ".join(cleaned)


class UserWriteSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=Role.choices)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True, default="")
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_email",
            "actor_name",
            "action",
            "entity_type",
            "entity_id",
            "summary",
            "metadata",
            "ip_address",
            "created_at",
        ]

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return "System"
        profile = getattr(obj.actor, "profile", None)
        if profile:
            return profile.display_name
        return obj.actor.get_full_name() or obj.actor.username or obj.actor.email


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "code_prefix", "sort_order"]


class SupplierSerializer(serializers.ModelSerializer):
    ingredient_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "company_name",
            "contact_person",
            "phone",
            "email",
            "country",
            "city",
            "rating",
            "notes",
            "supplier_type",
            "ingredient_count",
            "created_at",
        ]
        read_only_fields = ["created_at"]


class PriceHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = IngredientPriceHistory
        fields = ["id", "price", "recorded_at"]


class IngredientListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.company_name", read_only=True)
    expiry_status = serializers.CharField(read_only=True)
    days_to_expiry = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Ingredient
        extra_kwargs = {"code": {"required": False, "allow_blank": True, "read_only": True}}
        fields = [
            "id",
            "code",
            "name",
            "category",
            "category_name",
            "supplier",
            "supplier_name",
            "batch_number",
            "expiry_date",
            "received_date",
            "unit",
            "quantity",
            "par_level",
            "price_per_unit",
            "notes",
            "storage_conditions",
            "is_secret",
            "shelf_life_days",
            "is_trial",
            "trial_status",
            "rejection_reason",
            "rejection_notes",
            "photo",
            "expiry_status",
            "days_to_expiry",
            "is_low_stock",
            "created_at",
        ]


class IngredientDetailSerializer(IngredientListSerializer):
    price_history = PriceHistorySerializer(many=True, read_only=True)
    alternative_ids = serializers.PrimaryKeyRelatedField(
        source="alternatives", many=True, queryset=Ingredient.objects.all(), required=False
    )
    alternatives_detail = serializers.SerializerMethodField()
    secret_viewer_ids = serializers.PrimaryKeyRelatedField(
        source="secret_viewers",
        many=True,
        queryset=User.objects.filter(is_active=True),
        required=False,
    )
    secret_viewers_detail = serializers.SerializerMethodField()

    class Meta(IngredientListSerializer.Meta):
        fields = IngredientListSerializer.Meta.fields + [
            "price_history",
            "alternative_ids",
            "alternatives_detail",
            "secret_viewer_ids",
            "secret_viewers_detail",
            "updated_at",
        ]

    def get_alternatives_detail(self, obj):
        return [
            {"id": a.id, "code": a.code, "name": a.name}
            for a in obj.alternatives.all()
        ]

    def get_secret_viewers_detail(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not can_manage_secret_access(user):
            return []
        return [
            {
                "id": u.id,
                "display_name": getattr(getattr(u, "profile", None), "display_name", None)
                or u.get_full_name()
                or u.username,
                "email": u.email,
                "role": getattr(getattr(u, "profile", None), "role", None),
            }
            for u in obj.secret_viewers.select_related("profile").all()
        ]

    def create(self, validated_data):
        viewers = validated_data.pop("secret_viewers", None)
        alternatives = validated_data.pop("alternatives", None)
        ingredient = Ingredient.objects.create(**validated_data)
        if alternatives is not None:
            ingredient.alternatives.set(alternatives)
        if ingredient.is_secret and viewers is not None:
            ingredient.secret_viewers.set(viewers)
        elif not ingredient.is_secret:
            ingredient.secret_viewers.clear()
        return ingredient

    def update(self, instance, validated_data):
        viewers = validated_data.pop("secret_viewers", serializers.empty)
        alternatives = validated_data.pop("alternatives", serializers.empty)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if alternatives is not serializers.empty:
            instance.alternatives.set(alternatives)
        if not instance.is_secret:
            instance.secret_viewers.clear()
        elif viewers is not serializers.empty:
            instance.secret_viewers.set(viewers)
        return instance


class RecipeLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeLine
        fields = ["id", "name", "quantity", "unit", "ingredient", "cost_per_unit", "sort_order"]


class PrepStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrepStep
        fields = ["id", "text", "sort_order"]


class CommitteeRatingSerializer(serializers.ModelSerializer):
    avg = serializers.SerializerMethodField()

    class Meta:
        model = CommitteeRating
        fields = [
            "id",
            "trial",
            "member_name",
            "taste",
            "texture",
            "cost",
            "consistency",
            "overall",
            "avg",
            "notes",
            "submitted_at",
        ]
        read_only_fields = ["submitted_at"]

    def get_avg(self, obj):
        return member_rating_average(obj)


class MealTrialListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.company_name", read_only=True)
    ingredient_count = serializers.IntegerField(read_only=True)
    avg_rating = serializers.SerializerMethodField()
    expiry_status = serializers.CharField(read_only=True)
    expiry_remaining_label = serializers.CharField(read_only=True)
    archive_reasons = serializers.SerializerMethodField()

    class Meta:
        model = MealTrial
        fields = [
            "id",
            "code",
            "title",
            "supplier",
            "supplier_name",
            "trial_date",
            "conducted_by",
            "success_rate",
            "taste",
            "texture",
            "cost",
            "consistency",
            "overall",
            "verdict",
            "rejection_reason",
            "rejection_notes",
            "servings",
            "selling_price",
            "repetition_number",
            "expiry_amount",
            "expiry_unit",
            "expires_at",
            "expiry_status",
            "expiry_remaining_label",
            "archive_reasons",
            "ingredient_count",
            "avg_rating",
            "final_dish_photo",
            "created_at",
        ]

    def get_avg_rating(self, obj):
        summary = committee_rating_summary(obj)
        if summary and summary["avg_rating"] is not None:
            return summary["avg_rating"]
        scores = [obj.taste, obj.texture, obj.cost, obj.consistency, obj.overall]
        scores = [s for s in scores if s]
        return round(sum(scores) / len(scores), 2) if scores else 0

    def get_archive_reasons(self, obj):
        return trial_archive_reasons(obj)


class MealTrialDetailSerializer(MealTrialListSerializer):
    recipe_lines = RecipeLineSerializer(many=True, required=False)
    prep_steps = PrepStepSerializer(many=True, required=False)
    ingredient_ids = serializers.PrimaryKeyRelatedField(
        source="ingredients",
        many=True,
        queryset=Ingredient.objects.filter(is_trial=False),
        required=False,
    )
    cost_summary = serializers.SerializerMethodField()
    committee_count = serializers.IntegerField(read_only=True)
    committee_avg = serializers.SerializerMethodField()
    committee_scores = serializers.SerializerMethodField()

    class Meta(MealTrialListSerializer.Meta):
        fields = MealTrialListSerializer.Meta.fields + [
            "ingredient_ids",
            "cooking_temperature",
            "cooking_duration",
            "parent_trial",
            "notes",
            "photo",
            "recipe_lines",
            "prep_steps",
            "cost_summary",
            "committee_count",
            "committee_avg",
            "committee_scores",
            "updated_at",
        ]
        read_only_fields = [
            "code",
            "verdict",
            "rejection_reason",
            "rejection_notes",
            "photo",
            "final_dish_photo",
            "expires_at",
            "created_at",
            "updated_at",
        ]

    def get_cost_summary(self, obj):
        return trial_cost_summary(obj)

    def get_committee_avg(self, obj):
        summary = committee_rating_summary(obj)
        return summary["avg_rating"] if summary else None

    def get_committee_scores(self, obj):
        summary = committee_rating_summary(obj)
        return summary["categories"] if summary else None

    def create(self, validated_data):
        recipe = validated_data.pop("recipe_lines", [])
        steps = validated_data.pop("prep_steps", [])
        ingredients = validated_data.pop("ingredients", [])
        trial = MealTrial.objects.create(**validated_data)
        if ingredients:
            trial.ingredients.set(ingredients)
        self._replace_nested(trial, recipe, steps)
        sync_approved_trial_to_product(trial)
        return trial

    def update(self, instance, validated_data):
        recipe = validated_data.pop("recipe_lines", None)
        steps = validated_data.pop("prep_steps", None)
        ingredients = validated_data.pop("ingredients", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if ingredients is not None:
            instance.ingredients.set(ingredients)
        if recipe is not None or steps is not None:
            self._replace_nested(
                instance,
                recipe if recipe is not None else None,
                steps if steps is not None else None,
            )
        sync_approved_trial_to_product(instance)
        return instance

    def _replace_nested(self, trial, recipe, steps):
        if recipe is not None:
            trial.recipe_lines.all().delete()
            for i, line in enumerate(recipe):
                RecipeLine.objects.create(trial=trial, sort_order=line.get("sort_order", i), **{
                    k: v for k, v in line.items() if k not in ("sort_order", "id")
                })
        if steps is not None:
            trial.prep_steps.all().delete()
            for i, step in enumerate(steps):
                PrepStep.objects.create(
                    trial=trial,
                    text=step["text"],
                    sort_order=step.get("sort_order", i),
                )


class ProductEvaluationSerializer(serializers.ModelSerializer):
    ingredient_ids = serializers.PrimaryKeyRelatedField(
        source="ingredients",
        many=True,
        queryset=Ingredient.objects.filter(is_trial=False).select_related("category"),
        required=False,
    )
    trial_ids = serializers.PrimaryKeyRelatedField(
        source="trials", many=True, queryset=MealTrial.objects.all(), required=False
    )
    ingredient_titles = serializers.SerializerMethodField()
    trial_titles = serializers.SerializerMethodField()
    selling_price = serializers.SerializerMethodField()

    class Meta:
        model = ProductEvaluation
        fields = [
            "id",
            "product_name",
            "ingredient_ids",
            "ingredient_titles",
            "trial_ids",
            "trial_titles",
            "selling_price",
            "avg_success_rate",
            "avg_rating",
            "recommendation",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_ingredient_titles(self, obj):
        return [
            {
                "id": i.id,
                "code": i.code,
                "name": i.name,
                "category_name": i.category.name if i.category_id else "",
            }
            for i in obj.ingredients.all()
        ]

    def get_trial_titles(self, obj):
        return [{"id": t.id, "code": t.code, "title": t.title} for t in obj.trials.all()]

    def get_selling_price(self, obj):
        prices = [
            t.selling_price
            for t in obj.trials.all()
            if t.selling_price is not None
        ]
        if not prices:
            return None
        return round(sum(prices) / len(prices), 3)

    def create(self, validated_data):
        ingredients = validated_data.pop("ingredients", [])
        trials = validated_data.pop("trials", [])
        obj = ProductEvaluation.objects.create(**validated_data)
        obj.ingredients.set(ingredients)
        obj.trials.set(trials)
        self._refresh_averages(obj)
        return obj

    def update(self, instance, validated_data):
        ingredients = validated_data.pop("ingredients", None)
        trials = validated_data.pop("trials", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if ingredients is not None:
            instance.ingredients.set(ingredients)
        if trials is not None:
            instance.trials.set(trials)
        self._refresh_averages(instance)
        return instance

    def _refresh_averages(self, obj):
        refresh_product_averages(obj)


class PublicTrialSerializer(serializers.ModelSerializer):
    expiry_status = serializers.CharField(read_only=True)
    expiry_remaining_label = serializers.CharField(read_only=True)

    class Meta:
        model = MealTrial
        fields = [
            "id",
            "code",
            "title",
            "trial_date",
            "conducted_by",
            "cooking_temperature",
            "cooking_duration",
            "repetition_number",
            "final_dish_photo",
            "expiry_amount",
            "expiry_unit",
            "expires_at",
            "expiry_status",
            "expiry_remaining_label",
        ]
