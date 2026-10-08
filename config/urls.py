from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from lab.spa import spa_view
from lab import portal_sso

urlpatterns = [
    path("sso/consume", portal_sso.sso_consume, name="portal_sso_consume"),
    path("internal/portal/users/upsert", portal_sso.portal_upsert, name="portal_upsert"),
    path("internal/portal/users/revoke", portal_sso.portal_revoke, name="portal_revoke"),
    path("admin/", admin.site.urls),
    path("api/", include("lab.urls")),
    re_path(
        r"^media/(?P<path>.*)$",
        serve,
        {"document_root": settings.MEDIA_ROOT},
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])

urlpatterns += [
    re_path(r"^(?P<path>.*)$", spa_view),
]
