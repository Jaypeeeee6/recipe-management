from django.db import migrations, models


def set_draft_trials_pending(apps, schema_editor):
    MealTrial = apps.get_model("lab", "MealTrial")
    MealTrial.objects.filter(status="draft", verdict="suitable").update(verdict="pending")


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0002_mealtrial_expires_at_mealtrial_expiry_amount_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="mealtrial",
            name="rejection_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="mealtrial",
            name="rejection_reason",
            field=models.CharField(
                blank=True,
                choices=[("taste", "Taste"), ("price", "Price"), ("other", "Other")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="mealtrial",
            name="verdict",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("suitable", "Approved"),
                    ("not_suitable", "Rejected"),
                    ("emergency_substitute", "Emergency Substitute"),
                ],
                default="pending",
                max_length=32,
            ),
        ),
        migrations.RunPython(set_draft_trials_pending, migrations.RunPython.noop),
    ]
