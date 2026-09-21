from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0008_labsettings_multi_emails"),
    ]

    operations = [
        migrations.AddField(
            model_name="mealtrial",
            name="expiry_alert_sent_for",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
