from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("lab", "0004_roles_and_audit_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="ingredient",
            name="secret_viewers",
            field=models.ManyToManyField(
                blank=True,
                help_text="Extra users Admin has allowed to see this secret ingredient.",
                related_name="visible_secret_ingredients",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
