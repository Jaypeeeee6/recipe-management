from datetime import datetime, timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    STAFF = "staff", "Staff"
    VIEWER = "viewer", "Viewer"
    IT = "it", "IT"


class SupplierType(models.TextChoices):
    FOOD = "food", "Food & Ingredients"
    EQUIPMENT = "equipment", "Equipment & Tools"
    PACKAGING = "packaging", "Packaging"
    SERVICES = "services", "Services"
    OTHER = "other", "Other"


class TrialProductStatus(models.TextChoices):
    TESTING = "testing", "Under Testing"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class RejectionReason(models.TextChoices):
    TASTE = "taste", "Taste"
    PRICE = "price", "Price"
    OTHER = "other", "Other"


class TrialStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    COMPLETED = "completed", "Completed"


class ExpiryUnit(models.TextChoices):
    HOURS = "hours", "Hours"
    DAYS = "days", "Days"


class Verdict(models.TextChoices):
    PENDING = "pending", "Pending"
    SUITABLE = "suitable", "Approved"
    NOT_SUITABLE = "not_suitable", "Rejected"
    EMERGENCY = "emergency_substitute", "Emergency Substitute"


class Recommendation(models.TextChoices):
    APPROVED = "approved", "Approved"
    BACKUP_ONLY = "backup_only", "Backup Only"
    REJECTED = "rejected", "Rejected"
    PENDING = "pending", "Pending"


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    display_name = models.CharField(max_length=120)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)

    def __str__(self):
        return f"{self.display_name} ({self.role})"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    summary = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        who = self.actor_id or "system"
        return f"{self.created_at:%Y-%m-%d %H:%M} {who} {self.action}"


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    code_prefix = models.CharField(max_length=8)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Supplier(models.Model):
    company_name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    country = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80, blank=True)
    rating = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)
    supplier_type = models.CharField(
        max_length=20, choices=SupplierType.choices, default=SupplierType.FOOD
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name


class Ingredient(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="ingredients"
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ingredients",
    )
    batch_number = models.CharField(max_length=80, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)
    unit = models.CharField(max_length=20, default="kg")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    par_level = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    price_per_unit = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    notes = models.TextField(blank=True)
    storage_conditions = models.CharField(max_length=200, blank=True)
    is_secret = models.BooleanField(default=False)
    secret_viewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="visible_secret_ingredients",
        help_text="Extra users Admin has allowed to see this secret ingredient.",
    )
    shelf_life_days = models.PositiveIntegerField(null=True, blank=True)
    is_trial = models.BooleanField(default=False)
    trial_status = models.CharField(
        max_length=20,
        choices=TrialProductStatus.choices,
        default=TrialProductStatus.TESTING,
        blank=True,
    )
    rejection_reason = models.CharField(
        max_length=20, choices=RejectionReason.choices, blank=True
    )
    rejection_notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to="ingredients/", blank=True)
    alternatives = models.ManyToManyField(
        "self", blank=True, symmetrical=False, related_name="alternative_for"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def expiry_status(self):
        if not self.expiry_date:
            return "valid"
        today = timezone.localdate()
        delta = (self.expiry_date - today).days
        if delta < 0:
            return "expired"
        if delta <= 30:
            return "expiring_soon"
        return "valid"

    @property
    def days_to_expiry(self):
        if not self.expiry_date:
            return None
        return (self.expiry_date - timezone.localdate()).days

    @property
    def is_low_stock(self):
        return self.par_level and self.quantity < self.par_level


class IngredientPriceHistory(models.Model):
    ingredient = models.ForeignKey(
        Ingredient, on_delete=models.CASCADE, related_name="price_history"
    )
    price = models.DecimalField(max_digits=12, decimal_places=3)
    recorded_at = models.DateField()

    class Meta:
        ordering = ["recorded_at"]


class MealTrial(models.Model):
    code = models.CharField(max_length=32, unique=True)
    title = models.CharField(max_length=200)
    ingredients = models.ManyToManyField(
        Ingredient, blank=True, related_name="trials"
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trials",
    )
    trial_date = models.DateField(null=True, blank=True)
    conducted_by = models.CharField(max_length=120, blank=True)
    success_rate = models.PositiveSmallIntegerField(default=0)
    taste = models.PositiveSmallIntegerField(default=0)
    texture = models.PositiveSmallIntegerField(default=0)
    cost = models.PositiveSmallIntegerField(default=0)
    consistency = models.PositiveSmallIntegerField(default=0)
    overall = models.PositiveSmallIntegerField(default=0)
    verdict = models.CharField(
        max_length=32, choices=Verdict.choices, default=Verdict.PENDING
    )
    rejection_reason = models.CharField(
        max_length=20, choices=RejectionReason.choices, blank=True
    )
    rejection_notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=TrialStatus.choices, default=TrialStatus.DRAFT
    )
    servings = models.PositiveIntegerField(default=1)
    selling_price = models.DecimalField(
        max_digits=12, decimal_places=3, null=True, blank=True
    )
    cooking_temperature = models.PositiveIntegerField(null=True, blank=True)
    cooking_duration = models.PositiveIntegerField(null=True, blank=True)
    repetition_number = models.PositiveIntegerField(default=1)
    expiry_amount = models.PositiveIntegerField(null=True, blank=True)
    expiry_unit = models.CharField(
        max_length=10, choices=ExpiryUnit.choices, default=ExpiryUnit.DAYS, blank=True
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    parent_trial = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="iterations",
    )
    notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to="trials/", blank=True)
    final_dish_photo = models.ImageField(upload_to="trials/dishes/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-trial_date", "-id"]

    def __str__(self):
        return f"{self.code} {self.title}"

    def save(self, *args, **kwargs):
        self.expires_at = self.compute_expires_at()
        self.apply_expiry_rejection()
        super().save(*args, **kwargs)

    def apply_expiry_rejection(self):
        """Expired trials are automatically marked not suitable / completed."""
        if not self.expires_at or timezone.now() < self.expires_at:
            return False
        changed = False
        if self.verdict != Verdict.NOT_SUITABLE:
            self.verdict = Verdict.NOT_SUITABLE
            changed = True
        if self.status != TrialStatus.COMPLETED:
            self.status = TrialStatus.COMPLETED
            changed = True
        return changed

    def compute_expires_at(self):
        if not self.expiry_amount:
            return None
        tz = timezone.get_current_timezone()
        now = timezone.localtime()
        if self.trial_date:
            if self.expiry_unit == ExpiryUnit.HOURS:
                if self.pk and self.created_at:
                    anchor_time = timezone.localtime(self.created_at).time().replace(
                        microsecond=0
                    )
                else:
                    anchor_time = now.time().replace(microsecond=0)
            else:
                # Day-based shelf life starts at the beginning of the trial date.
                anchor_time = datetime.min.time()
            start = timezone.make_aware(
                datetime.combine(self.trial_date, anchor_time), tz
            )
        elif self.created_at:
            start = timezone.localtime(self.created_at)
        else:
            start = now
        if self.expiry_unit == ExpiryUnit.HOURS:
            return start + timedelta(hours=self.expiry_amount)
        return start + timedelta(days=self.expiry_amount)

    @property
    def expiry_status(self):
        if not self.expires_at:
            return None
        now = timezone.now()
        if self.expires_at <= now:
            return "expired"
        remaining = self.expires_at - now
        if remaining <= timedelta(days=10):
            return "expiring_soon"
        return "valid"

    @property
    def expiry_remaining_label(self):
        if not self.expires_at:
            return None
        seconds = int((self.expires_at - timezone.now()).total_seconds())
        expired = seconds < 0
        seconds = abs(seconds)
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        if days >= 1:
            text = f"{days} day{'s' if days != 1 else ''}"
            if hours and not expired:
                text += f" {hours} hr{'s' if hours != 1 else ''}"
        elif hours >= 1:
            text = f"{hours} hour{'s' if hours != 1 else ''}"
        else:
            mins = max(1, minutes)
            text = f"{mins} minute{'s' if mins != 1 else ''}"
        if expired:
            return f"Expired {text} ago"
        return f"Expires in {text}"


class RecipeLine(models.Model):
    trial = models.ForeignKey(
        MealTrial, on_delete=models.CASCADE, related_name="recipe_lines"
    )
    name = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    unit = models.CharField(max_length=20, default="g")
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recipe_uses",
    )
    cost_per_unit = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class PrepStep(models.Model):
    trial = models.ForeignKey(
        MealTrial, on_delete=models.CASCADE, related_name="prep_steps"
    )
    text = models.TextField()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class ProductEvaluation(models.Model):
    product_name = models.CharField(max_length=200)
    ingredients = models.ManyToManyField(
        Ingredient, blank=True, related_name="evaluations"
    )
    trials = models.ManyToManyField(MealTrial, blank=True, related_name="evaluations")
    avg_success_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    avg_rating = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    recommendation = models.CharField(
        max_length=20, choices=Recommendation.choices, default=Recommendation.PENDING
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.product_name


class CommitteeRating(models.Model):
    trial = models.ForeignKey(
        MealTrial, on_delete=models.CASCADE, related_name="committee_ratings"
    )
    member_name = models.CharField(max_length=120)
    taste = models.PositiveSmallIntegerField(default=0)
    texture = models.PositiveSmallIntegerField(default=0)
    cost = models.PositiveSmallIntegerField(default=0)
    consistency = models.PositiveSmallIntegerField(default=0)
    overall = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]
