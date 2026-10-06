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
    can_manage_lab_settings: false,
    can_view_audit: false,
    can_manage_categories: false,
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

export function canManageLabSettings(user) {
  // IT role always manages alert email; also honor API permission flag.
  return user?.role === "it" || !!perms(user).can_manage_lab_settings;
}

export function canViewAudit(user) {
  return user?.role === "it" || !!perms(user).can_view_audit;
}

export function canManageCategories(user) {
  return user?.role === "admin" || !!perms(user).can_manage_categories;
}
