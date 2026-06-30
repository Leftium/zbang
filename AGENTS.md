# AGENTS.md

## Search Scope

Generated catalog JSON is large and should not be part of broad code searches.

- Start source/spec searches in scoped paths such as `src`, `specs`, and `scripts`.
- Prefer commands like `rg -n "bangEntry|shortcut" src specs scripts`.
- Do not use broad searches like `rg -n "bang|shortcut|filter" .` unless the query explicitly needs generated data.
- Search `catalogs/` only when the task is about catalog generation, catalog validation, or a specific bang/catalog record.
- When searching catalogs, use targeted filenames, focused patterns, structured tools such as `jq`, and output limits.

## Generated Catalogs

Files under `catalogs/*.json` are generated data artifacts.

- Do not manually edit generated catalogs unless the user explicitly asks.
- Prefer changing source data, generator scripts, or validation logic, then regenerating the catalog through the project scripts.
