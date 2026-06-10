# Restaurant chain catalogs

Each file here is one restaurant or chain. Run `npm run restaurants:sync` to merge them into `catalog.json`.

## File format

```json
{
  "id": "chipotle",
  "name": "Chipotle",
  "source": "chipotle.com/nutrition",
  "syncedAt": "2026-06-10T12:00:00.000Z",
  "items": [
    {
      "id": "chipotle:chicken",
      "name": "Chicken",
      "category": "Protein",
      "menu": null,
      "servingSize": "4 oz",
      "serving_size_g": 113,
      "tags": [],
      "nutrients": {
        "calories": 180,
        "protein_g": 32,
        "carbs_g": 0,
        "fat_g": 7
      }
    }
  ]
}
```

Item IDs must be unique across all chains (prefix with the chain id, e.g. `chipotle:…`).

Add scrapers under `scripts/scrapers/` and write output here, or paste JSON manually.
