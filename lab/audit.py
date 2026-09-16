from .models import AuditLog


def client_ip(request):
    if not request:
        return ""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def log_action(
    *,
    request=None,
    user=None,
    action,
    entity_type="",
    entity_id="",
    summary="",
    metadata=None,
):
    """Write an audit log entry. Failures never block the request."""
    try:
        actor = user
        if actor is None and request is not None:
            actor = getattr(request, "user", None)
        if actor is not None and not getattr(actor, "is_authenticated", False):
            actor = None
        AuditLog.objects.create(
            actor=actor,
            action=action,
            entity_type=entity_type or "",
            entity_id=str(entity_id or ""),
            summary=(summary or "")[:500],
            metadata=metadata or {},
            ip_address=client_ip(request),
        )
    except Exception:
        # Never break the primary request because of logging.
        pass
