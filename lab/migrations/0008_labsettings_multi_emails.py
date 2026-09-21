from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0007_labsettings_expiry_alerts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="labsettings",
            name="expiry_alert_email",
            field=models.TextField(
                blank=True,
                help_text="Recipients for ingredient expiring-soon emails (comma or newline separated).",
            ),
        ),
    ]
