# Catalogs

These JSON files are generated artifacts. Do not edit them by hand.

Each provider is split into:

- `popular`: default shipped records with `popularity > 0`
- `extended`: on-demand records with `popularity === 0`

Regenerate them with:

```sh
npm run generate:catalogs
```
