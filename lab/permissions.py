from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role, UserProfile


def user_role(user):
    if not user or not user.is_authenticated:
        return None
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={
            "display_name": user.get_full_name() or user.username,
            "role": Role.VIEWER,
        },
    )
    return profile.role


def is_admin(user):
    return user_role(user) == Role.ADMIN


def is_staff_role(user):
    return user_role(user) == Role.STAFF


def is_viewer(user):
    return user_role(user) == Role.VIEWER


def is_it(user):
    return user_role(user) == Role.IT


def can_see_secrets(user):
    """Admin and IT can view all secret ingredients."""
    return user_role(user) in (Role.ADMIN, Role.IT)


def can_manage_secret_access(user):
    """Only Admin can grant who may see a secret ingredient."""
    return is_admin(user)


def visible_ingredients_q(user):
    """Filter: non-secret, or secret visible to Admin/IT, or explicitly granted."""
    if can_see_secrets(user):
        return Q()
    return Q(is_secret=False) | Q(secret_viewers=user)


def can_write(user):
    """Admin, Staff, and IT can create/update/delete. Viewer is read-only."""
    return user_role(user) in (Role.ADMIN, Role.STAFF, Role.IT)


def can_manage_users(user):
    """Only IT can register and manage user accounts."""
    return is_it(user)


def can_view_audit(user):
    """Admin and IT can view audit logs."""
    return user_role(user) in (Role.ADMIN, Role.IT)


def can_clear_data(user):
    return user_role(user) == Role.ADMIN


class IsAuthenticatedReadOrWriteRole(BasePermission):
    """Authenticated users can read; only write roles can mutate."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return can_write(request.user)
