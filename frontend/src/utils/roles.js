export function roleLabel(role) {
  return (
    {
      admin: "Admin",
      staff: "Staff",
      viewer: "Viewer",
      it: "IT",
    }[role] || role || "—"
  );
}

export function perms(user) {
  return user?.permissions || {
    can_write: false,
    can_see_secrets: false,
    can_manage_users: false,
    can_manage_secret_access: false,
    can_view_audit: false,
    can_clear_data: false,
  };
}

export function canWrite(user) {
  return !!perms(user).can_write;
}

export function canSeeSecrets(user) {
  return !!perms(user).can_see_secrets;
}

export function canManageUsers(user) {
  return !!perms(user).can_manage_users;
}

export function canManageSecretAccess(user) {
  return !!perms(user).can_manage_secret_access;
}

export function canViewAudit(user) {
  return !!perms(user).can_view_audit;
}

export function canClearData(user) {
  return !!perms(user).can_clear_data;
}
