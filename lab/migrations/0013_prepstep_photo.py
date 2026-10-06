from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0012_productevaluation_photo"),
    ]

    operations = [
        migrations.AddField(
            model_name="prepstep",
            name="photo",
            field=models.ImageField(blank=True, upload_to="trials/prep_steps/"),
        ),
    ]
