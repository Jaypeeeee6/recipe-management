from django.contrib import admin

from . import models as m

admin.site.site_header = "Recipe Management System"
admin.site.site_title = "Recipe Management System"
admin.site.index_title = "Administration"


@admin.register(m.UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "role")


@admin.register(m.Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "code_prefix", "sort_order")


@admin.register(m.Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("company_name", "contact_person", "city", "rating")


@admin.register(m.Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "supplier", "quantity", "is_trial")
    list_filter = ("category", "is_trial", "is_secret")
    search_fields = ("code", "name", "batch_number")


@admin.register(m.MealTrial)
class MealTrialAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "trial_date", "expires_at", "verdict", "status", "success_rate")


@admin.register(m.ProductEvaluation)
class ProductEvaluationAdmin(admin.ModelAdmin):
    list_display = ("product_name", "recommendation", "avg_success_rate", "avg_rating")


@admin.register(m.AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "entity_type", "entity_id", "summary")
    list_filter = ("action", "entity_type")
    search_fields = ("summary", "entity_id", "actor__email")


@admin.register(m.CommitteeRating)
class CommitteeRatingAdmin(admin.ModelAdmin):
    list_display = ("trial", "member_name", "overall", "submitted_at")
