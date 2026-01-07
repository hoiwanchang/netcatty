# Netcatty Plugin Template

This folder is a minimal template for creating a plugin ZIP that can be imported from the **Settings → Plugins** tab.

## ZIP structure

Create a ZIP file that contains a `manifest.json` either:

- at the ZIP root

or

- inside a single top-level folder (e.g. `my-plugin/manifest.json`)

The app will search for `manifest.json` and read it.

## `manifest.json` schema

Required fields:

- `id`: string
  - lower-case letters/numbers and `-` or `_`
  - length 2–64
  - must not conflict with built-in ids: `ai`, `zebra`, `commandCandidates`, `serverStatus`, `portKnocking`
- `name`: string
- `version`: string

Optional fields:

- `description`: string
- `homepage`: string

## Current behavior (important)

At the moment, importing a plugin ZIP stores **metadata only** (the manifest). The app does **not** load or execute third‑party plugin code yet.

This template exists so you can:

- validate the import/install/update/delete workflow
- standardize plugin ids and versions

## How to build a ZIP

- Put `manifest.json` in a folder
- ZIP it
- Import the ZIP from **Settings → Plugins → Import ZIP**
