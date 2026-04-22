# Rebrand to "Source Map Viewer" + CLI Package

## Rebrand

Rename the project display name from "Source Map Visualization" to "Source Map Viewer". The repo name and Void project slug stay as-is.

### Files to update

- `src/constants/index.ts` — `APP_NAME` → `"Source Map Viewer"`
- `void.json` — title, meta description, OG tags, twitter tags
- `pages/layout.vue` — JSON-LD schema `name`
- `public/llms.txt` — heading and description
- `README.md` — heading and description
- `CLAUDE.md` — project description references
- `package.json` — `name` stays `source-map-visualization` (repo name unchanged)

## CLI Package: `source-map-viewer`

### Location

`packages/cli/` in the monorepo. Add to `pnpm-workspace.yaml`. Shares `src/core/` modules from the root package via relative imports or workspace dependency.

### Usage

```bash
npx source-map-viewer bundle.js           # auto-detect sourceMappingURL → upload → open browser
npx source-map-viewer bundle.js.map       # .map file directly → upload → open browser
npx source-map-viewer bundle.js --url     # just print the short URL
npx source-map-viewer bundle.js --ai      # print markdown debug report to stdout (offline, pipe-friendly)
```

### Input handling

1. Read file path from CLI args
2. Detect file type by extension:
   - `.js`, `.ts`, `.css` → read file, extract inline `sourceMappingURL` (base64 data URI or relative path to .map file)
   - `.map`, `.json` → treat as source map JSON, look for sibling generated file by stripping `.map` extension
3. Result: `{ generatedCode: string, sourceMapJson: string }`
4. Error with clear message if source map can't be found

### Output modes

**Default (no flags):**

1. POST `{ generatedCode, sourceMapJson }` to `https://source-map-visualization.voidzero.dev/api/share`
2. Get back `{ id, url }`
3. Open URL in default browser via `open` package
4. Print URL to stdout

**`--url` / `--no-open`:**

1. Same POST to share API
2. Print URL to stdout only (no browser)

**`--ai`:**

1. Parse source map locally using `core/parser.ts`
2. Build mapping index using `core/mapper.ts`
3. Validate using `core/validator.ts`
4. Generate markdown debug report using `core/prompt.ts`
5. Print to stdout (pipe-friendly: `npx source-map-viewer bundle.js --ai | pbcopy`)
6. No network request needed — fully offline

### Package structure

```
packages/cli/
  package.json          # name: "source-map-viewer", bin: { "source-map-viewer": "./bin.mjs" }
  bin.mjs               # #!/usr/bin/env node entry point
  src/
    cli.ts              # arg parsing, orchestration
    upload.ts           # POST to share API
    resolve.ts          # file reading + sourceMappingURL extraction
```

### Dependencies

- `src/core/parser.ts` — full parser (Node.js has no `new Function()` restriction unlike Workers)
- `src/core/mapper.ts` — build mapping index
- `src/core/validator.ts` — validate mappings
- `src/core/prompt.ts` — generate markdown debug report
- `open` — open URL in default browser
- No framework dependencies (no Vue, no Void SDK)

### package.json

```json
{
  "name": "source-map-viewer",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "source-map-viewer": "./bin.mjs"
  },
  "files": ["bin.mjs", "dist"],
  "dependencies": {
    "open": "^10.0.0",
    "source-map-js": "^1.2.1"
  }
}
```

### Build

The CLI needs to bundle `src/core/*` modules since they live outside the package directory. Use a simple build step (esbuild or Rollup) to bundle `src/cli.ts` → `dist/cli.mjs`, then `bin.mjs` imports from `dist/cli.mjs`.

Alternatively, reference the root `src/core/*` via workspace dependency — the root package exports the core modules, and the CLI package depends on `"source-map-visualization": "workspace:*"`.

### API endpoint

The CLI uploads to the production site by default:

- `https://source-map-visualization.voidzero.dev/api/share`

This can be overridden with `--host` for development:

- `npx source-map-viewer bundle.js --host http://localhost:5173`

### Error handling

- File not found → clear error with path
- No sourceMappingURL in .js file → error with hint to pass .map file directly
- Source map parse failure → error with details
- API upload failure → error with suggestion to use `--ai` for offline mode
- Invalid args → print usage help
