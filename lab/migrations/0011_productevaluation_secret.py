from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("lab", "0010_mealtrial_secret"),
    ]

    operations = [
        migrations.AddField(
            model_name="productevaluation",
            name="is_secret",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="productevaluation",
            name="secret_viewers",
            field=models.ManyToManyField(
                blank=True,
                help_text="Extra users Admin has allowed to see this secret product.",
                related_name="visible_secret_products",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
