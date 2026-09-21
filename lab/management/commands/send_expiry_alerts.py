from django.core.management.base import BaseCommand

from lab.expiry_alerts import send_trial_expiry_alerts


class Command(BaseCommand):
    help = "Email the IT-configured addresses about meal trials that are expiring soon."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Run even if expiry alerts are disabled in Lab Settings.",
        )

    def handle(self, *args, **options):
        result = send_trial_expiry_alerts(force=options["force"])
        if result.get("error"):
            self.stderr.write(self.style.ERROR(f"Failed: {result['error']}"))
            return
        if result["sent"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sent alert for {result['count']} trial(s) to {result['recipient']}."
                )
            )
            return
        reason = result.get("skipped") or "unknown"
        self.stdout.write(
            f"No email sent ({reason}). Recipient: {result.get('recipient') or '—'}"
        )
