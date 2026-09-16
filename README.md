# MAA Recipe & Ingredient Lab

R&D lab for ingredients, meal trials, costing, and tasting-committee ratings. Features follow the [Ingredient & Meal Trial Lab](https://maa-ingredient-lab.netlify.app/) product, with visual design aligned to MAA Inventory. English only.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite + React |
| Backend | Django 6 + Django REST Framework |
| Database | PostgreSQL |
| Auth | JWT (simplejwt) |

## Features

- Login with roles: Admin, Chef, QA, Procurement
- Dashboard: totals, charts, low stock, expiring items, recent trials
- Ingredients: approved vs trial products, par levels, price history, alternatives, approve/reject, secret ingredients
- Suppliers: directory with rating and type
- Meal trials: recipe lines, prep steps, ratings, verdicts, recipe scaling, profitability (food cost %), print recipe, committee QR
- Public tasting-committee page (no login)
- Products & evaluations with 2–3 product radar comparison
- Reports with date/category/supplier/verdict filters, CSV and print/PDF export
- Settings: users, categories, verdict definitions, clear data

## Setup

### 1. Backend

```bash
cd recipe-management
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # already created for local use
```

Create the database (PostgreSQL):

```bash
createdb maa_recipe_db   # or: psql -c "CREATE DATABASE maa_recipe_db;"
```

```bash
python manage.py migrate
python manage.py seed_lab
```

Demo login: `admin@lab.test` / `admin123`  
Chef login: `salim@lab.test` / `chef123`

### 2. Frontend build (served by Django)

```bash
cd frontend
npm install
npm run build
```

### 3. Run

```bash
python manage.py runserver 8000
```

Open http://127.0.0.1:8000/

For live frontend reload during UI work, also run `npm run dev` in `frontend/` and use http://localhost:5173 (Vite proxies `/api` to Django).

SQLite fallback: set `USE_SQLITE=true` in `.env` if PostgreSQL is unavailable.
