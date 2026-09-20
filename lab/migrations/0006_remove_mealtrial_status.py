from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("lab", "0005_ingredient_secret_viewers"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="mealtrial",
            name="status",
        ),
    ]
