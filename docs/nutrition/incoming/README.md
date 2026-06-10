# Nutrition drop zone

Drop curated nutrition files here, then run `npm run nutrition:import`.

## Restaurants

`restaurants/<chain-id>.csv` + optional `restaurants/<chain-id>.meta.json`:

```json
{ "id": "chipotle", "name": "Chipotle" }
```

Or a full chain JSON: `restaurants/chipotle.json`

## Duke

`duke/<location-id>.csv` + optional `duke/<location-id>.meta.json`:

```json
{ "id": "ginger-soy", "name": "Ginger + Soy" }
```

CSV columns: `name,calories,protein_g,carbs_g,fat_g,serving_size_g,servingSize,category,menu`

After import, run `npm run restaurants:sync` for restaurants. Duke curated output goes to `data/duke-dining/curated.json`.
