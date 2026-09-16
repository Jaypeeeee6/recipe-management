from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("categories", views.CategoryViewSet)
router.register("suppliers", views.SupplierViewSet, basename="supplier")
router.register("ingredients", views.IngredientViewSet, basename="ingredient")
router.register("trials", views.MealTrialViewSet, basename="trial")
router.register("evaluations", views.ProductEvaluationViewSet, basename="evaluation")
router.register("users", views.LabUserViewSet, basename="lab-user")

urlpatterns = [
    path("auth/login/", views.login_view),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", views.me_view),
    path("dashboard/", views.dashboard_view),
    path("reports/", views.reports_view),
    path("audit-logs/", views.audit_logs_view),
    path("settings/clear-data/", views.clear_all_data),
    path("public/trials/<int:pk>/", views.public_trial_view),
    path("public/trials/<int:pk>/committee-ratings/", views.public_committee_submit),
    path("trials/<int:pk>/committee-ratings/", views.trial_committee_ratings),
    path("", include(router.urls)),
]
