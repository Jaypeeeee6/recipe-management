from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("lab", "0009_mealtrial_expiry_alert_sent_for"),
    ]

    operations = [
        migrations.AddField(
            model_name="mealtrial",
            name="is_secret",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="mealtrial",
            name="secret_viewers",
            field=models.ManyToManyField(
                blank=True,
                help_text="Extra users Admin has allowed to see this secret meal trial.",
                related_name="visible_secret_trials",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
