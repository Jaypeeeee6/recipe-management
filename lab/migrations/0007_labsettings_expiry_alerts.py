from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0006_remove_mealtrial_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="ingredient",
            name="expiry_alert_sent_for",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="LabSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "expiry_alert_email",
                    models.EmailField(
                        blank=True,
                        help_text="Recipient for ingredient expiring-soon emails.",
                        max_length=254,
                    ),
                ),
                ("expiry_alerts_enabled", models.BooleanField(default=True)),
                ("last_expiry_alert_run", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Lab settings",
                "verbose_name_plural": "Lab settings",
            },
        ),
    ]
