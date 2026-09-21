"""Meal trial expiring-soon email alerts (not ingredients)."""

from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from django.utils import timezone

from .models import ExpiryUnit, LabSettings, MealTrial
from .utils import trial_archive_q


def trials_expiring_soon_queryset():
    """Active trials inside the expiring-soon window (5 hours or 1 day)."""
    now = timezone.now()
    window = Q(expiry_unit=ExpiryUnit.HOURS, expires_at__lte=now + timedelta(hours=5)) | (
        ~Q(expiry_unit=ExpiryUnit.HOURS) & Q(expires_at__lte=now + timedelta(days=1))
    )
    return (
        MealTrial.objects.exclude(trial_archive_q())
        .filter(expires_at__isnull=False, expires_at__gt=now)
        .filter(window)
        .select_related("supplier")
        .order_by("expires_at", "title")
    )


def pending_expiry_alert_trials():
    """Expiring soon and not yet emailed for this expires_at value."""
    return [
        t
        for t in trials_expiring_soon_queryset()
        if t.expiry_alert_sent_for != t.expires_at
    ]


def build_trial_expiry_alert_body(trials):
    lines = [
        "The following meal trials are expiring soon:",
        "",
        "Rule: last 5 hours (hours shelf life) or last 1 day (days shelf life).",
        "",
    ]
    for t in trials:
        remaining = t.expiry_remaining_label or "soon"
        expires = timezone.localtime(t.expires_at).strftime("%Y-%m-%d %H:%M") if t.expires_at else "—"
        unit = t.get_expiry_unit_display() if t.expiry_unit else "—"
        lines.append(
            f"- {t.code} {t.title} — expires {expires} ({remaining})"
            f" [shelf life: {t.expiry_amount or '—'} {unit}]"
        )
    lines.extend(
        [
            "",
            "Please review these trials before they expire.",
            "",
            "— MAA Recipe Lab",
        ]
    )
    return "\n".join(lines)


def send_trial_expiry_alerts(*, force=False):
    """
    Email IT-configured recipients about newly expiring-soon meal trials.
    Returns dict with sent, skipped, count, recipients, error.
    """
    lab = LabSettings.get_solo()
    recipients = lab.expiry_alert_recipients()
    recipients_label = ", ".join(recipients)

    if not lab.expiry_alerts_enabled and not force:
        return {
            "sent": False,
            "skipped": "disabled",
            "count": 0,
            "recipient": recipients_label,
            "recipients": recipients,
        }

    if not recipients:
        lab.last_expiry_alert_run = timezone.now()
        lab.save(update_fields=["last_expiry_alert_run"])
        return {
            "sent": False,
            "skipped": "no_recipient",
            "count": 0,
            "recipient": "",
            "recipients": [],
        }

    pending = pending_expiry_alert_trials()
    if not pending:
        lab.last_expiry_alert_run = timezone.now()
        lab.save(update_fields=["last_expiry_alert_run"])
        return {
            "sent": False,
            "skipped": "none_pending",
            "count": 0,
            "recipient": recipients_label,
            "recipients": recipients,
        }

    subject = f"[MAA Recipe Lab] {len(pending)} meal trial(s) expiring soon"
    body = build_trial_expiry_alert_body(pending)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@localhost")

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=from_email,
            recipient_list=recipients,
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "sent": False,
            "skipped": "error",
            "count": len(pending),
            "recipient": recipients_label,
            "recipients": recipients,
            "error": str(exc),
        }

    for trial in pending:
        trial.expiry_alert_sent_for = trial.expires_at
        # Avoid recompute side-effects; only touch the alert marker.
        MealTrial.objects.filter(pk=trial.pk).update(expiry_alert_sent_for=trial.expires_at)

    lab.last_expiry_alert_run = timezone.now()
    lab.save(update_fields=["last_expiry_alert_run"])

    return {
        "sent": True,
        "skipped": None,
        "count": len(pending),
        "recipient": recipients_label,
        "recipients": recipients,
        "trial_ids": [t.id for t in pending],
    }


# Backwards-compatible alias used by older imports
def send_ingredient_expiry_alerts(*, force=False):
    return send_trial_expiry_alerts(force=force)


def maybe_run_expiry_alerts(min_interval_minutes=30):
    """Throttle automatic checks so dashboard traffic does not spam mail."""
    lab = LabSettings.get_solo()
    if not lab.expiry_alerts_enabled or not lab.expiry_alert_recipients():
        return {"sent": False, "skipped": "not_configured"}
    if lab.last_expiry_alert_run:
        elapsed = timezone.now() - lab.last_expiry_alert_run
        if elapsed < timedelta(minutes=min_interval_minutes):
            return {"sent": False, "skipped": "throttled"}
    return send_trial_expiry_alerts()
