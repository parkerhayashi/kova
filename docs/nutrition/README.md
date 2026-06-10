# Nutrition data curation

Scraped restaurant and Duke dining catalogs are **starting points**, not source of truth. For accuracy, curate what you actually eat.

## Fix strategy (in order)

| Step | What | Effort | Effect |
|------|------|--------|--------|
| 1 | **Trim** — keep only chains/locations you use | Low | Less noise, fewer wrong hits |
| 2 | **Override** — patch bad items by id | Medium | Fix calories/macros without re-scraping |
| 3 | **Replace** — drop a curated CSV/JSON | Best | Full control for your regular orders |

**Do not re-run** `npm run restaurants:scrape` or `npm run duke:sync` unless you're refreshing from official sources and re-validating. Scrapers reproduce the same parsing errors.

## Drop zone

Put files in `docs/nutrition/incoming/`:

| Folder | For |
|--------|-----|
| `restaurants/` | Chain CSV or JSON (see template below) |
| `duke/` | Per-location CSV or JSON |

Then run:

```bash
npm run nutrition:import
```

Or tell Cursor: *"import the nutrition files I dropped"*.

## Restaurants

**Per-chain files:** `data/restaurants/chains/<id>.json`  
**Overrides:** `data/restaurants/overrides.json` — patch items by id  
**Allowlist (optional):** `data/restaurants/allowlist.json` — hide all chains not listed

After editing chains or overrides:

```bash
npm run restaurants:sync
```

### CSV template (restaurants)

```csv
name,calories,protein_g,carbs_g,fat_g,serving_size_g,servingSize,category
Chicken Bowl,650,45,60,20,680,1 bowl,Bowls
```

Save as `docs/nutrition/incoming/restaurants/chipotle.csv` with a matching `meta.json`:

```json
{ "id": "chipotle", "name": "Chipotle" }
```

## Duke dining

**Full auto catalog:** `data/duke-dining/catalog.json` (~76k lines, sync-generated)  
**Curated catalog (recommended):** `data/duke-dining/curated.json` — when present, **replaces** the auto catalog entirely  
**Overrides:** `data/duke-dining/overrides.json` — patch items by id (applied on top of whichever catalog loads)

Build `curated.json` by exporting only the locations/items you log. Same shape as `catalog.json`:

```json
{
  "syncedAt": "2026-06-10T00:00:00.000Z",
  "source": "manual",
  "locations": [{ "id": "ginger-soy", "name": "Ginger + Soy", "itemCount": 12 }],
  "items": [ ... ]
}
```

### CSV template (duke)

```csv
name,calories,protein_g,carbs_g,fat_g,serving_size_g,servingSize,category,menu
Orange Chicken,510,16,45,25,168,5.92 oz,Entrees,All Day
```

Save as `docs/nutrition/incoming/duke/ginger-soy.csv` with:

```json
{ "id": "ginger-soy", "name": "Ginger + Soy" }
```

## Quick overrides (one item)

Edit `data/restaurants/overrides.json` or `data/duke-dining/overrides.json`:

```json
{
  "chipotle:chicken": {
    "nutrients": { "calories": 180, "protein_g": 32, "carbs_g": 0, "fat_g": 7 },
    "serving_size_g": 113,
    "servingSize": "4 oz"
  }
}
```

Changes apply on next page load (no sync needed for overrides).
