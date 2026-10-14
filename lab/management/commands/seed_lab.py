from datetime import date, timedelta
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
    RejectionReason,
    Role,
    Supplier,
    SupplierType,
    UserProfile,
    Verdict,
)
from lab.utils import sync_all_approved_trials


def d(offset):
    return (timezone.localdate() + timedelta(days=offset))


SAMPLE_MEALS = [
    ("Crispy chicken burger", "1.300"),
    ("Coleslaw chicken burger", "1.300"),
    ("Spicy chicken burger", "1.300"),
    ("Kids chicken meal", "1.000"),
    ("Fried chicken bucket", "1.000"),
    ("Chicken cheese burger", "1.300"),
    ("Beef burger", "1.300"),
    ("Loaded fries", "1.100"),
    ("Crispy chicken fries", "2.000"),
    ("Shawarma fries", "1.500"),
    ("Spicy steak fries", "1.500"),
    ("Twisted fries", "1.500"),
    ("Crispy shrimp fries", "3.000"),
    ("Seasoned fries", "0.500"),
    ("Cheese fries", "0.800"),
    ("Spicy shrimp", "2.500"),
    ("Spicy crispy chicken", "1.500"),
    ("Creamy pasta", "1.800"),
    ("Shrimp marinara pasta", "2.200"),
    ("Popcorn chicken", "0.900"),
    ("Steak pasta", "1.800"),
    ("Lemon mint juice", "1.000"),
    ("Blue milkshake", "1.000"),
    ("Mini pancakes", "1.400"),
    ("Pancakes", "1.400"),
    ("Chocolate stick dessert", "2.000"),
    ("Chocolate cup", "1.400"),
]

SAMPLE_CHEFS = ["Chef Salim", "Chef Mariam", "Chef Yusuf", "Chef Aisha"]


def _iter_days(start, end):
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def _day_plan(day, today):
    """Return (kind, count) so some days have 4 approvals and some have 4 rejections."""
    delta = (today - day).days
    weekday = day.weekday()
    week = day.isocalendar()[1]
    if 0 <= delta <= 13:
        return [
            ("approved", 4),
            ("mixed", 2),
            ("rejected", 4),
            ("none", 0),
            ("approved", 4),
            ("mixed", 1),
            ("rejected", 4),
            ("none", 0),
            ("approved", 4),
            ("mixed", 2),
            ("rejected", 4),
            ("none", 0),
            ("approved", 4),
            ("mixed", 2),
        ][delta]
    if week % 6 == 0:
        return "none", 0
    if weekday not in (0, 2, 4):
        return "none", 0
    if weekday == 2 and week % 4 == 0:
        return "approved", 4
    if weekday == 4 and week % 4 == 2:
        return "rejected", 4
    if week % 4 == 1:
        return "mixed", 2
    return "mixed", 1


def _slot_verdict(kind, slot, seq):
    if kind == "approved":
        return Verdict.SUITABLE
    if kind == "rejected":
        return Verdict.NOT_SUITABLE
    if slot == 0:
        return Verdict.SUITABLE
    if seq % 9 == 0:
        return Verdict.EMERGENCY
    if seq % 11 == 0:
        return Verdict.PENDING
    return Verdict.NOT_SUITABLE


def seed_chart_trials(suppliers, ings):
    """Add dated trials so dashboard charts have a readable 4-up / 4-down shape."""
    MealTrial.objects.filter(code__startswith="SMP-").delete()
    supplier_list = list(suppliers.values())
    ing_list = list(ings.values())
    today = timezone.localdate()
    created = 0
    ranges = [
        (date(2025, 1, 6), date(2025, 12, 19)),
        (date(2026, 1, 5), today),
    ]
    for start, end in ranges:
        seq = 0
        for day in _iter_days(start, end):
            kind, per_day = _day_plan(day, today)
            if kind == "none" or per_day <= 0:
                continue
            for slot in range(per_day):
                seq += 1
                created += 1
                code = f"SMP-{day.year}-{seq:03d}"
                meal, price = SAMPLE_MEALS[(seq + slot) % len(SAMPLE_MEALS)]
                chef = SAMPLE_CHEFS[(seq + day.weekday()) % len(SAMPLE_CHEFS)]
                verdict = _slot_verdict(kind, slot, seq)
                if verdict == Verdict.SUITABLE:
                    success = 78 + ((seq * 3) % 21)
                    reason = ""
                    notes = "Committee approved. Ready to move toward production."
                elif verdict == Verdict.NOT_SUITABLE:
                    success = 38 + ((seq * 5) % 28)
                    reason = (RejectionReason.TASTE, RejectionReason.PRICE, RejectionReason.OTHER)[slot % 3]
                    notes = "Did not meet the standard. Archived after committee review."
                elif verdict == Verdict.EMERGENCY:
                    success = 70 + (seq % 12)
                    reason = ""
                    notes = "Approved as an emergency substitute only."
                else:
                    success = 0
                    reason = ""
                    notes = "Awaiting committee tasting."
                trial, _ = MealTrial.objects.update_or_create(
                    code=code,
                    defaults={
                        "title": meal,
                        "supplier": supplier_list[seq % len(supplier_list)],
                        "trial_date": day,
                        "conducted_by": chef,
                        "success_rate": success,
                        "taste": 2 + (seq % 4),
                        "texture": 2 + ((seq + 1) % 4),
                        "cost": 2 + ((seq + 2) % 4),
                        "consistency": 2 + ((seq + 3) % 4),
                        "overall": 2 + ((seq + day.weekday()) % 4),
                        "verdict": verdict,
                        "rejection_reason": reason,
                        "rejection_notes": notes if verdict == Verdict.NOT_SUITABLE else "",
                        "servings": 1,
                        "selling_price": Decimal(price) if verdict == Verdict.SUITABLE else None,
                        "cooking_temperature": 180 + (seq % 50),
                        "cooking_duration": 8 + (seq % 28),
                        "repetition_number": 1 + (slot % 3),
                        "expiry_amount": None,
                        "expiry_unit": "days",
                        "notes": notes,
                    },
                )
                if ing_list:
                    start_i = seq % len(ing_list)
                    trial.ingredients.set(ing_list[start_i:start_i + 4] or ing_list[:4])
    return created


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
            dict(code="SP-001", name="Smoked Paprika", category="Spice", supplier="s4", batch="SPR-PAP-2026-D1", expiry=300, received=-40, unit="kg", qty=5, par=2, price="8.000", notes="Key spice for beef burger seasoning.", storage="Airtight, cool, dry", history=[("7.500", -120)]),
            dict(code="SP-002", name="Black Pepper (Ground)", category="Spice", supplier="s4", batch="SPR-BPP-2026-D2", expiry=365, received=-30, unit="kg", qty=4, par=2, price="5.000", notes="Fine ground, for patty seasoning.", storage="Airtight container"),
            dict(code="SP-003", name="Salt (Fine)", category="Spice", supplier="s4", batch="SPR-SLT-2026-D3", expiry=730, received=-60, unit="kg", qty=20, par=5, price="0.300", notes="Iodized fine salt.", storage="Airtight, dry"),
            dict(code="SC-001", name="House Special Sauce", category="Sauce", supplier="s6", batch="SWD-BSS-2026-E1", expiry=120, received=-10, unit="L", qty=25, par=10, price="2.000", notes="Proprietary blend. Refrigerate after opening.", storage="2–8°C after opening", secret=True, shelf=14, history=[("1.800", -90)]),
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
            ("House Special Sauce", "15", "ml", "SC-001", "2.000"),
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
            ("House Special Sauce", "18", "ml", "SC-001", "2.000"),
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
            "Slice tomatoes and lettuce. Spread special sauce on the top bun.",
            "Assemble: bottom bun, lettuce, tomato, patty + cheese, sauce, top bun.",
        ]
        steps_v2 = [
            "Season the beef with smoked paprika, black pepper, and salt. Rest for 10 minutes.",
            "Improved bun dough: 75g flour + 8g melted butter + yeast + warm water. Knead 8 minutes, rest 1 hour, add sesame, bake at 190°C for 15 minutes — lighter and softer than v1.",
            "Heat the grill to high (230°C) and add a thin layer of sunflower oil.",
            "Grill the patty 3 minutes per side, add cheese, cover 30 seconds to melt.",
            "Slice tomatoes and lettuce. Spread 18ml of the balanced special sauce on the top bun.",
            "Assemble: bottom bun, lettuce, tomato, patty + cheese, sauce, sesame top bun.",
        ]

        t1, _ = MealTrial.objects.update_or_create(
            code="BRG-001-V1",
            defaults={
                "title": "Beef burger — Trial v1",
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
                "title": "Beef burger",
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
                "servings": 1,
                "selling_price": Decimal("1.300"),
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

        ProductEvaluation.objects.filter(product_name="Boom Burger Classic").update(
            product_name="Beef burger"
        )
        eval_obj, _ = ProductEvaluation.objects.update_or_create(
            product_name="Beef burger",
            defaults={
                "avg_success_rate": Decimal("89.00"),
                "avg_rating": Decimal("4.50"),
                "recommendation": Recommendation.APPROVED,
                "notes": "Final beef burger trial fully approved for production. Earlier version serves as baseline only.",
            },
        )
        eval_obj.ingredients.set(list(ings.values())[:12])
        eval_obj.trials.set([t1, t2])

        extra = seed_chart_trials(suppliers, ings)
        sync_all_approved_trials()
        keep_names = {name for name, _ in SAMPLE_MEALS}
        keep_names.update({"Beef burger", "Beef burger — Trial v1"})
        ProductEvaluation.objects.exclude(product_name__in=keep_names).delete()

        self.stdout.write(self.style.SUCCESS(
            f"Seeded ingredient lab demo data ({extra} sample chart trials)."
        ))
        self.stdout.write("Admin:  admin@lab.test / admin123")
        self.stdout.write("Staff:  staff@lab.test / staff123")
        self.stdout.write("Viewer: viewer@lab.test / viewer123")
        self.stdout.write("IT:     it@lab.test / it123")
