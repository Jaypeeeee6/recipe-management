from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from lab.models import (
    Category,
    Ingredient,
    IngredientPriceHistory,
    MealTrial,
    PrepStep,
    ProductEvaluation,
    RecipeLine,
    Recommendation,
    Role,
    Supplier,
    SupplierType,
    TrialStatus,
    UserProfile,
    Verdict,
)


def d(offset):
    return (timezone.localdate() + timedelta(days=offset))


class Command(BaseCommand):
    help = "Seed demo users, suppliers, ingredients, trials, and evaluations."

    def handle(self, *args, **options):
        admin_user, created = User.objects.get_or_create(
            username="admin@lab.test",
            defaults={"email": "admin@lab.test", "is_staff": True, "is_superuser": True},
        )
        admin_user.email = "admin@lab.test"
        admin_user.set_password("admin123")
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
        UserProfile.objects.update_or_create(
            user=admin_user,
            defaults={"display_name": "Admin User", "role": Role.ADMIN},
        )

        staff, _ = User.objects.get_or_create(
            username="staff@lab.test", defaults={"email": "staff@lab.test"}
        )
        staff.email = "staff@lab.test"
        staff.set_password("staff123")
        staff.save()
        UserProfile.objects.update_or_create(
            user=staff, defaults={"display_name": "Staff User", "role": Role.STAFF}
        )

        viewer, _ = User.objects.get_or_create(
            username="viewer@lab.test", defaults={"email": "viewer@lab.test"}
        )
        viewer.email = "viewer@lab.test"
        viewer.set_password("viewer123")
        viewer.save()
        UserProfile.objects.update_or_create(
            user=viewer, defaults={"display_name": "Viewer User", "role": Role.VIEWER}
        )

        it_user, _ = User.objects.get_or_create(
            username="it@lab.test", defaults={"email": "it@lab.test"}
        )
        it_user.email = "it@lab.test"
        it_user.set_password("it123")
        it_user.save()
        UserProfile.objects.update_or_create(
            user=it_user, defaults={"display_name": "IT Support", "role": Role.IT}
        )

        # Keep legacy demo chef account mapped to staff.
        chef, _ = User.objects.get_or_create(
            username="salim@lab.test", defaults={"email": "salim@lab.test"}
        )
        chef.email = "salim@lab.test"
        chef.set_password("chef123")
        chef.save()
        UserProfile.objects.update_or_create(
            user=chef, defaults={"display_name": "Chef Salim", "role": Role.STAFF}
        )

        cats = {}
        for i, (name, prefix) in enumerate(
            [
                ("Flour", "FL"),
                ("Oil", "OL"),
                ("Dairy", "DY"),
                ("Sauce", "SC"),
                ("Spice", "SP"),
                ("Meat", "MT"),
                ("Vegetable", "VG"),
                ("Other", "OT"),
            ]
        ):
            cats[name], _ = Category.objects.update_or_create(
                name=name, defaults={"code_prefix": prefix, "sort_order": i}
            )

        suppliers_data = [
            ("s1", "MeatMasters LLC", "Hassan Al-Amri", "+968 9500 7890", "hassan@meatmasters.om", "Oman", "Salalah", 5, "Halal certified, consistent quality."),
            ("s2", "Golden Mills Co.", "Ahmed Al-Rashidi", "+968 9100 1234", "ahmed@goldenmills.om", "Oman", "Muscat", 5, "Premium flour supplier, ISO certified."),
            ("s3", "AlMazraa Dairy", "Khalid Hassan", "+968 9300 9012", "khalid@almazraa.om", "Oman", "Nizwa", 4, "Fresh dairy products, local farms."),
            ("s4", "SpiceRoute International", "Priya Nair", "+968 9400 3456", "priya@spiceroute.com", "India", "Mumbai", 4, "Wide variety of spices and seeds."),
            ("s5", "FreshFarm Vegetables", "Ali Al-Qasmi", "+968 9600 2345", "ali@freshfarm.om", "Oman", "Al Batinah", 4, "Organic options available."),
            ("s6", "SauceWorld Trading", "Maria Santos", "+968 9700 6789", "maria@sauceworld.com", "UAE", "Dubai", 4, "Premium sauces, condiments, and cooking oils."),
        ]
        suppliers = {}
        for key, company, contact, phone, email, country, city, rating, notes in suppliers_data:
            suppliers[key], _ = Supplier.objects.update_or_create(
                company_name=company,
                defaults={
                    "contact_person": contact,
                    "phone": phone,
                    "email": email,
                    "country": country,
                    "city": city,
                    "rating": rating,
                    "notes": notes,
                    "supplier_type": SupplierType.FOOD,
                },
            )

        ingredients_data = [
            dict(code="MT-001", name="Beef Chuck Blend (80/20)", category="Meat", supplier="s1", batch="MMT-BEF-2026-A1", expiry=3, received=-2, unit="kg", qty=15, par=20, price="4.500", notes="Fresh ground, Halal certified. Use within 3 days.", storage="0–2°C, use within 3 days of receipt", history=[("4.200", -90), ("4.350", -45)]),
            dict(code="FL-001", name="Premium Bread Flour", category="Flour", supplier="s2", batch="GML-FL-2026-B1", expiry=90, received=-15, unit="kg", qty=80, par=50, price="0.850", notes="High-gluten flour, ideal for burger buns.", storage="Dry, cool area <25°C", history=[("0.750", -90), ("0.800", -60)]),
            dict(code="DY-001", name="Cheddar Cheese Slices", category="Dairy", supplier="s3", batch="AMZ-CHE-2026-C1", expiry=20, received=-10, unit="kg", qty=8, par=10, price="6.000", notes="Pre-sliced, consistent melt.", storage="2–4°C refrigerated", history=[("5.500", -60)]),
            dict(code="DY-002", name="Butter (Unsalted)", category="Dairy", supplier="s3", batch="AMZ-BUT-2026-C2", expiry=12, received=-18, unit="kg", qty=12, par=5, price="7.000", notes="For bun dough enrichment.", storage="2–4°C refrigerated"),
            dict(code="SP-001", name="Smoked Paprika", category="Spice", supplier="s4", batch="SPR-PAP-2026-D1", expiry=300, received=-40, unit="kg", qty=5, par=2, price="8.000", notes="Key spice for Boom Burger seasoning.", storage="Airtight, cool, dry", history=[("7.500", -120)]),
            dict(code="SP-002", name="Black Pepper (Ground)", category="Spice", supplier="s4", batch="SPR-BPP-2026-D2", expiry=365, received=-30, unit="kg", qty=4, par=2, price="5.000", notes="Fine ground, for patty seasoning.", storage="Airtight container"),
            dict(code="SP-003", name="Salt (Fine)", category="Spice", supplier="s4", batch="SPR-SLT-2026-D3", expiry=730, received=-60, unit="kg", qty=20, par=5, price="0.300", notes="Iodized fine salt.", storage="Airtight, dry"),
            dict(code="SC-001", name="Boom Special Sauce", category="Sauce", supplier="s6", batch="SWD-BSS-2026-E1", expiry=120, received=-10, unit="L", qty=25, par=10, price="2.000", notes="Proprietary blend. Refrigerate after opening.", storage="2–8°C after opening", secret=True, shelf=14, history=[("1.800", -90)]),
            dict(code="OL-001", name="Sunflower Oil", category="Oil", supplier="s6", batch="SWD-OIL-2026-E2", expiry=180, received=-20, unit="L", qty=60, par=20, price="1.200", notes="High smoke point, for searing patty.", storage="Room temp, away from light"),
            dict(code="VG-001", name="Roma Tomatoes", category="Vegetable", supplier="s5", batch="FFM-TOM-2026-F1", expiry=7, received=-3, unit="kg", qty=18, par=10, price="0.800", notes="Firm, consistent size. Slice before service.", storage="Room temp or 10–12°C"),
            dict(code="VG-002", name="Iceberg Lettuce", category="Vegetable", supplier="s5", batch="FFM-LET-2026-F2", expiry=5, received=-4, unit="kg", qty=10, par=5, price="0.500", notes="Crisp and fresh. Shred before service.", storage="2–4°C"),
            dict(code="OT-001", name="Sesame Seeds (White)", category="Other", supplier="s4", batch="SPR-SES-2026-D4", expiry=200, received=-20, unit="kg", qty=6, par=2, price="4.000", notes="Bun topping. Toast lightly before use.", storage="Airtight, dry"),
            dict(code="SC-T01", name="Smoky Chipotle Trial Sauce", category="Sauce", supplier="s6", batch="SWD-CHIP-T01", expiry=45, received=-5, unit="L", qty=4, par=2, price="2.400", notes="Trial batch for heat-level testing.", storage="2–8°C", trial=True),
        ]

        ings = {}
        for row in ingredients_data:
            obj, _ = Ingredient.objects.update_or_create(
                code=row["code"],
                defaults={
                    "name": row["name"],
                    "category": cats[row["category"]],
                    "supplier": suppliers[row["supplier"]],
                    "batch_number": row["batch"],
                    "expiry_date": d(row["expiry"]),
                    "received_date": d(row["received"]),
                    "unit": row["unit"],
                    "quantity": Decimal(str(row["qty"])),
                    "par_level": Decimal(str(row["par"])),
                    "price_per_unit": Decimal(row["price"]),
                    "notes": row["notes"],
                    "storage_conditions": row["storage"],
                    "is_secret": row.get("secret", False),
                    "shelf_life_days": row.get("shelf"),
                    "is_trial": row.get("trial", False),
                    "trial_status": "testing" if row.get("trial") else "approved",
                },
            )
            ings[row["code"]] = obj
            for price, offset in row.get("history", []):
                IngredientPriceHistory.objects.get_or_create(
                    ingredient=obj, price=Decimal(price), recorded_at=d(offset)
                )

        recipe_v1 = [
            ("Beef Chuck Blend (80/20)", "150", "g", "MT-001", "4.500"),
            ("Premium Bread Flour", "80", "g", "FL-001", "0.850"),
            ("Cheddar Cheese Slices", "20", "g", "DY-001", "6.000"),
            ("Butter (Unsalted)", "5", "g", "DY-002", "7.000"),
            ("Smoked Paprika", "1", "g", "SP-001", "8.000"),
            ("Black Pepper (Ground)", "0.5", "g", "SP-002", "5.000"),
            ("Salt (Fine)", "2", "g", "SP-003", "0.300"),
            ("Boom Special Sauce", "15", "ml", "SC-001", "2.000"),
            ("Sunflower Oil", "5", "ml", "OL-001", "1.200"),
            ("Roma Tomatoes", "30", "g", "VG-001", "0.800"),
            ("Iceberg Lettuce", "15", "g", "VG-002", "0.500"),
            ("Sesame Seeds (White)", "2", "g", "OT-001", "4.000"),
        ]
        recipe_v2 = [
            ("Beef Chuck Blend (80/20)", "150", "g", "MT-001", "4.500"),
            ("Premium Bread Flour", "75", "g", "FL-001", "0.850"),
            ("Cheddar Cheese Slices", "20", "g", "DY-001", "6.000"),
            ("Butter (Unsalted)", "8", "g", "DY-002", "7.000"),
            ("Smoked Paprika", "1", "g", "SP-001", "8.000"),
            ("Black Pepper (Ground)", "0.5", "g", "SP-002", "5.000"),
            ("Salt (Fine)", "2", "g", "SP-003", "0.300"),
            ("Boom Special Sauce", "18", "ml", "SC-001", "2.000"),
            ("Sunflower Oil", "5", "ml", "OL-001", "1.200"),
            ("Roma Tomatoes", "30", "g", "VG-001", "0.800"),
            ("Iceberg Lettuce", "15", "g", "VG-002", "0.500"),
            ("Sesame Seeds (White)", "2", "g", "OT-001", "4.000"),
        ]
        steps_v1 = [
            "Season the beef with smoked paprika, black pepper, and salt. Rest for 10 minutes.",
            "Make the bun dough: flour + melted butter + yeast + warm water. Knead 8 minutes, rest 1 hour, add sesame seeds, bake at 190°C for 15 minutes.",
            "Heat the grill to high (230°C) and add a thin layer of sunflower oil.",
            "Grill the patty 3 minutes per side, add cheese, cover 30 seconds to melt.",
            "Slice tomatoes and lettuce. Spread Boom sauce on the top bun.",
            "Assemble: bottom bun, lettuce, tomato, patty + cheese, sauce, top bun.",
        ]
        steps_v2 = [
            "Season the beef with smoked paprika, black pepper, and salt. Rest for 10 minutes.",
            "Improved bun dough: 75g flour + 8g melted butter + yeast + warm water. Knead 8 minutes, rest 1 hour, add sesame, bake at 190°C for 15 minutes — lighter and softer than v1.",
            "Heat the grill to high (230°C) and add a thin layer of sunflower oil.",
            "Grill the patty 3 minutes per side, add cheese, cover 30 seconds to melt.",
            "Slice tomatoes and lettuce. Spread 18ml of the balanced Boom sauce on the top bun.",
            "Assemble: bottom bun, lettuce, tomato, patty + cheese, sauce, sesame top bun.",
        ]

        t1, _ = MealTrial.objects.update_or_create(
            code="BRG-001-V1",
            defaults={
                "title": "Boom Burger Classic — Trial v1",
                "supplier": suppliers["s1"],
                "trial_date": d(-4),
                "conducted_by": "Chef Salim",
                "success_rate": 82,
                "taste": 4,
                "texture": 4,
                "cost": 4,
                "consistency": 3,
                "overall": 4,
                "verdict": Verdict.EMERGENCY,
                "status": TrialStatus.COMPLETED,
                "servings": 1,
                "cooking_temperature": 230,
                "cooking_duration": 12,
                "repetition_number": 1,
                "expiry_amount": 12,
                "expiry_unit": "hours",
                "notes": "First full assembly trial. Patty texture excellent. Bun slightly dense — needs formula adjustment. Sauce sweetness needs balancing.",
            },
        )
        t1.ingredients.set(list(ings.values())[:12])
        t1.recipe_lines.all().delete()
        t1.prep_steps.all().delete()
        for i, (name, qty, unit, code, cost) in enumerate(recipe_v1):
            RecipeLine.objects.create(
                trial=t1, name=name, quantity=Decimal(qty), unit=unit,
                ingredient=ings[code], cost_per_unit=Decimal(cost), sort_order=i,
            )
        for i, text in enumerate(steps_v1):
            PrepStep.objects.create(trial=t1, text=text, sort_order=i)

        t2, _ = MealTrial.objects.update_or_create(
            code="BRG-001-V2",
            defaults={
                "title": "Boom Burger Classic — Final Version",
                "supplier": suppliers["s1"],
                "trial_date": d(0),
                "conducted_by": "Chef Salim",
                "success_rate": 96,
                "taste": 5,
                "texture": 5,
                "cost": 4,
                "consistency": 5,
                "overall": 5,
                "verdict": Verdict.SUITABLE,
                "status": TrialStatus.COMPLETED,
                "servings": 1,
                "selling_price": Decimal("3.500"),
                "cooking_temperature": 230,
                "cooking_duration": 12,
                "repetition_number": 2,
                "parent_trial": t1,
                "expiry_amount": 5,
                "expiry_unit": "days",
                "notes": "Perfect. Bun formula adjusted (less flour, more butter). Sauce sweetness balanced. Full committee approval. Ready for production.",
            },
        )
        t2.ingredients.set(list(ings.values())[:12])
        t2.recipe_lines.all().delete()
        t2.prep_steps.all().delete()
        for i, (name, qty, unit, code, cost) in enumerate(recipe_v2):
            RecipeLine.objects.create(
                trial=t2, name=name, quantity=Decimal(qty), unit=unit,
                ingredient=ings[code], cost_per_unit=Decimal(cost), sort_order=i,
            )
        for i, text in enumerate(steps_v2):
            PrepStep.objects.create(trial=t2, text=text, sort_order=i)

        eval_obj, _ = ProductEvaluation.objects.update_or_create(
            product_name="Boom Burger Classic",
            defaults={
                "avg_success_rate": Decimal("89.00"),
                "avg_rating": Decimal("4.50"),
                "recommendation": Recommendation.APPROVED,
                "notes": "Final version BRG-001-V2 fully approved for production. Version V1 serves as baseline only. Review beef supplier if price exceeds 5.00 OMR/kg.",
            },
        )
        eval_obj.ingredients.set(list(ings.values())[:12])
        eval_obj.trials.set([t1, t2])

        self.stdout.write(self.style.SUCCESS("Seeded ingredient lab demo data."))
        self.stdout.write("Admin:  admin@lab.test / admin123")
        self.stdout.write("Staff:  staff@lab.test / staff123")
        self.stdout.write("Viewer: viewer@lab.test / viewer123")
        self.stdout.write("IT:     it@lab.test / it123")
