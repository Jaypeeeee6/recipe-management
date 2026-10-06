from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0013_prepstep_photo"),
    ]

    operations = [
        migrations.AlterField(
            model_name="mealtrial",
            name="cooking_temperature",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="prepstep",
            name="text",
            field=models.TextField(blank=True),
        ),
    ]
