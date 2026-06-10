# Kova branding

| Path | Purpose |
|------|---------|
| `incoming/` | **Drop zip here** — single intake folder |
| `guide/` | PDFs, specs, written brand rules (from zip) |
| `assets/` | Source logos, wordmarks, illustrations (from zip) |
| `fonts/` | Font files (from zip) |
| `manifest.json` | Auto-generated inventory after `npm run branding:apply` |

**Live implementation** (updated when branding is applied):

- Tokens → `app/globals.css` (`@theme`)
- Fonts → `app/layout.tsx`
- PWA icons → `public/icons/`
- Logos → `public/brand/`
- Agent rules → `AGENTS.md` (Design rules section)

Supersedes blueprint §4 for visual design when `guide/` contains a newer spec.
