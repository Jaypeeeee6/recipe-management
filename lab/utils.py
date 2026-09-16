from decimal import Decimal


MASS = {"kg": Decimal("1000"), "g": Decimal("1")}
VOLUME = {"l": Decimal("1000"), "ml": Decimal("1")}


def _family(unit: str):
    u = (unit or "").lower()
    if u in MASS:
        return "mass", MASS[u]
    if u in VOLUME:
        return "volume", VOLUME[u]
    return "other", Decimal("1")


def line_cost(quantity, recipe_unit, cost_per_unit, ingredient_unit=None):
    """Line cost from quantity in recipe units and price per stock unit."""
    qty = Decimal(str(quantity or 0))
    unit_price = Decimal(str(cost_per_unit or 0))
    if qty == 0 or unit_price == 0:
        return Decimal("0")

    recipe_family, recipe_base = _family(recipe_unit)
    stock_family, stock_base = _family(ingredient_unit or recipe_unit)

    if recipe_family == stock_family and recipe_family in ("mass", "volume"):
        qty_in_stock_units = qty * recipe_base / stock_base
        return (qty_in_stock_units * unit_price).quantize(Decimal("0.001"))

    return (qty * unit_price).quantize(Decimal("0.001"))


def trial_cost_summary(trial):
    total = Decimal("0")
    lines = []
    for line in trial.recipe_lines.select_related("ingredient").all():
        stock_unit = line.ingredient.unit if line.ingredient else line.unit
        cost = line_cost(line.quantity, line.unit, line.cost_per_unit, stock_unit)
        total += cost
        lines.append(
            {
                "id": line.id,
                "name": line.name,
                "quantity": str(line.quantity),
                "unit": line.unit,
                "stock_unit": stock_unit,
                "ingredient_id": line.ingredient_id,
                "cost_per_unit": str(line.cost_per_unit),
                "line_cost": str(cost),
            }
        )
    servings = trial.servings or 1
    per_serving = (total / Decimal(servings)).quantize(Decimal("0.001")) if servings else total
    selling = trial.selling_price
    profit = None
    if selling is not None:
        selling = Decimal(str(selling))
        gross = (selling - per_serving).quantize(Decimal("0.001"))
        margin = ((gross / selling) * Decimal("100")).quantize(Decimal("0.1")) if selling else None
        food_cost_pct = ((per_serving / selling) * Decimal("100")).quantize(Decimal("0.1")) if selling else None
        profit = {
            "selling_price": str(selling),
            "gross_profit": str(gross),
            "profit_margin": str(margin) if margin is not None else None,
            "food_cost_pct": str(food_cost_pct) if food_cost_pct is not None else None,
        }
    return {
        "total_cost": str(total),
        "cost_per_serving": str(per_serving),
        "servings": servings,
        "lines": lines,
        "profit": profit,
    }


CATEGORY_PREFIXES = {
    "Flour": "FL",
    "Oil": "OL",
    "Dairy": "DY",
    "Sauce": "SC",
    "Spice": "SP",
    "Meat": "MT",
    "Vegetable": "VG",
    "Other": "OT",
}


def next_ingredient_code(category):
    from .models import Ingredient

    prefix = category.code_prefix or "OT"
    existing = Ingredient.objects.filter(code__startswith=f"{prefix}-").values_list(
        "code", flat=True
    )
    max_n = 0
    for code in existing:
        try:
            max_n = max(max_n, int(code.split("-")[-1]))
        except (ValueError, IndexError):
            continue
    return f"{prefix}-{max_n + 1:04d}"


def next_trial_code(prefix="TEST"):
    from .models import MealTrial

    existing = MealTrial.objects.filter(code__startswith=f"{prefix}-").values_list(
        "code", flat=True
    )
    max_n = 0
    for code in existing:
        try:
            suffix = code.split("-", 1)[1]
            num = suffix.split("-")[0]
            max_n = max(max_n, int(num))
        except (ValueError, IndexError):
            continue
    return f"{prefix}-{max_n + 1:04d}"


def trial_archive_q():
    """Q filter for trials that belong in archives (rejected or expired)."""
    from django.db.models import Q
    from django.utils import timezone

    from .models import Verdict

    return Q(verdict=Verdict.NOT_SUITABLE) | Q(
        expires_at__isnull=False,
        expires_at__lte=timezone.now(),
    )


def is_trial_archived(trial):
    from django.utils import timezone

    from .models import Verdict

    if trial.verdict == Verdict.NOT_SUITABLE:
        return True
    if trial.expires_at and trial.expires_at <= timezone.now():
        return True
    return False


def trial_archive_reasons(trial):
    from django.utils import timezone

    from .models import Verdict

    reasons = []
    if trial.verdict == Verdict.NOT_SUITABLE:
        reasons.append("rejected")
    if trial.expires_at and trial.expires_at <= timezone.now():
        reasons.append("expired")
    return reasons


def expire_overdue_trials():
    """Persist auto-rejection for trials past their expiry time."""
    from django.utils import timezone

    from .models import MealTrial, TrialStatus, Verdict

    updated = MealTrial.objects.filter(
        expires_at__isnull=False,
        expires_at__lte=timezone.now(),
    ).exclude(
        verdict=Verdict.NOT_SUITABLE,
        status=TrialStatus.COMPLETED,
    ).update(
        verdict=Verdict.NOT_SUITABLE,
        status=TrialStatus.COMPLETED,
    )
    if updated:
        sync_all_approved_trials()
    return updated


def member_rating_average(rating):
    scores = [
        rating.taste,
        rating.texture,
        rating.cost,
        rating.consistency,
        rating.overall,
    ]
    scores = [s for s in scores if s]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 2)


def committee_rating_summary(trial):
    """Average category scores and overall rating from committee evaluations."""
    ratings = list(trial.committee_ratings.all())
    if not ratings:
        return None

    categories = ("taste", "texture", "cost", "consistency", "overall")
    category_avgs = {}
    for field in categories:
        values = [getattr(r, field) for r in ratings if getattr(r, field)]
        category_avgs[field] = round(sum(values) / len(values), 2) if values else None

    member_avgs = [member_rating_average(r) for r in ratings]
    member_avgs = [v for v in member_avgs if v is not None]
    avg_rating = round(sum(member_avgs) / len(member_avgs), 2) if member_avgs else None

    return {
        "count": len(ratings),
        "avg_rating": avg_rating,
        "categories": category_avgs,
    }


def sync_trial_ratings_from_committee(trial):
    """Write rounded committee averages onto the trial rating fields."""
    summary = committee_rating_summary(trial)
    if not summary:
        return False
    fields = []
    for field, value in summary["categories"].items():
        if value is None:
            continue
        setattr(trial, field, max(0, min(5, int(round(value)))))
        fields.append(field)
    if fields:
        trial.save(update_fields=fields)
    return True


def refresh_product_averages(product):
    from .models import MealTrial

    trials = list(product.trials.all())
    if not trials:
        ingredient_ids = product.ingredients.values_list("pk", flat=True)
        if ingredient_ids:
            trials = list(
                MealTrial.objects.filter(ingredients__id__in=ingredient_ids).distinct()
            )
    if not trials:
        product.avg_success_rate = 0
        product.avg_rating = 0
        product.save(update_fields=["avg_success_rate", "avg_rating"])
        return
    product.avg_success_rate = sum(t.success_rate for t in trials) / len(trials)
    ratings = []
    for t in trials:
        summary = committee_rating_summary(t)
        if summary and summary["avg_rating"] is not None:
            ratings.append(summary["avg_rating"])
            continue
        scores = [t.taste, t.texture, t.cost, t.consistency, t.overall]
        scores = [s for s in scores if s]
        if scores:
            ratings.append(sum(scores) / len(scores))
    product.avg_rating = sum(ratings) / len(ratings) if ratings else 0
    product.save(update_fields=["avg_success_rate", "avg_rating"])


def is_production_ready_trial(trial):
    from .models import Verdict

    return trial.verdict == Verdict.SUITABLE


def sync_approved_trial_to_product(trial):
    from .models import ProductEvaluation, Recommendation

    if not is_production_ready_trial(trial):
        unsync_trial_from_products(trial)
        return None

    product, _ = ProductEvaluation.objects.get_or_create(
        product_name=trial.title,
        defaults={
            "recommendation": Recommendation.APPROVED,
            "notes": trial.notes or "",
        },
    )
    product.trials.add(trial)
    approved_ingredients = trial.ingredients.filter(is_trial=False)
    if approved_ingredients.exists():
        product.ingredients.add(*approved_ingredients)
    if trial.notes and not product.notes:
        product.notes = trial.notes
        product.save(update_fields=["notes"])
    product.recommendation = Recommendation.APPROVED
    product.save(update_fields=["recommendation"])
    refresh_product_averages(product)
    return product


def unsync_trial_from_products(trial):
    from .models import ProductEvaluation

    for product in ProductEvaluation.objects.filter(trials=trial):
        product.trials.remove(trial)
        refresh_product_averages(product)


def sync_all_approved_trials():
    from .models import MealTrial

    for trial in MealTrial.objects.prefetch_related("ingredients"):
        if is_production_ready_trial(trial):
            sync_approved_trial_to_product(trial)
        else:
            unsync_trial_from_products(trial)
