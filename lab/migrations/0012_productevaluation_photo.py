from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0011_productevaluation_secret"),
    ]

    operations = [
        migrations.AddField(
            model_name="productevaluation",
            name="photo",
            field=models.ImageField(blank=True, upload_to="products/"),
        ),
    ]
