# Branding drop zone

**Drop your branding zip file here** (any name, e.g. `kova-brand.zip`).

Then either:

```bash
npm run branding:apply
```

…or tell Cursor: *"apply the branding zip"*.

The script unpacks it, sorts assets into `docs/branding/`, and copies production files into `public/brand/` and `public/icons/` where appropriate. After that, an agent updates `app/globals.css`, `app/layout.tsx`, and `public/manifest.json` to match.

You can leave the zip here or delete it once applied.
