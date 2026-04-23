# source-map-viewer

Inspect and debug source map mappings from the terminal.

The CLI uploads a source map to [source-map-viewer.void.app](https://source-map-viewer.void.app), opens the interactive viewer in your browser, or prints an AI-friendly Markdown report locally. It accepts either a file path or a folder that contains one unambiguous source map entrypoint.

## Usage

Run it with `vp dlx` in a Vite+ workspace, or `npx` elsewhere:

```bash
vp dlx source-map-viewer bundle.js
vp dlx source-map-viewer dist/
vp dlx source-map-viewer bundle.js --url
vp dlx source-map-viewer bundle.js --ai
vp dlx source-map-viewer bundle.js --copy

vp dlx source-map-viewer compare before.js after.js
vp dlx source-map-viewer compare before.js after.js --url
vp dlx source-map-viewer compare before.js after.js --ai

npx source-map-viewer bundle.js
npx source-map-viewer bundle.js --url
npx source-map-viewer bundle.js --ai
npx source-map-viewer compare before.js after.js --url
```

## Commands

```text
source-map-viewer <path>                        Upload a file or folder and open in browser
source-map-viewer <path> --url                  Print shareable URL only
source-map-viewer <path> --ai                   Print markdown debug report (offline)
source-map-viewer compare <pathA> <pathB>       Compare two source maps in browser
source-map-viewer compare <pathA> <pathB> --url Print compare URL only
source-map-viewer compare <pathA> <pathB> --ai  Print diff report to stdout
```

## Input Resolution

You can pass generated code, a source map file, or a folder.

- Generated code files: the CLI looks for an inline `sourceMappingURL`, an external `.map` reference, or a sibling `.map` file.
- Source map files: the CLI tries to find the generated file next to the map or via the source map `file` field.
- Folder inputs: the CLI recursively scans the folder, requires exactly one source map entrypoint, and uses the folder structure to hydrate missing `sourcesContent` where possible.
- Compare mode: both sides accept the same input formats.

Supported generated file extensions are `.js`, `.ts`, and `.css`. Supported source map file extensions are `.map` and `.json`.

## Options

- `--url` or `--no-open`: print the resulting URL instead of opening a browser
- `--ai`: print an offline Markdown debug report to stdout
- `--copy`: copy the URL or Markdown report to the clipboard
- `--host <url>`: use a custom deployment instead of `https://source-map-viewer.void.app`
- `-h`, `--help`: show help

## Examples

Open a visualization in your browser:

```bash
source-map-viewer dist/app.js
```

Print a shareable URL:

```bash
source-map-viewer dist/app.js --url
```

Generate a Markdown report for an AI tool:

```bash
source-map-viewer dist/app.js --ai | pbcopy
```

Compare two source maps without opening a browser:

```bash
source-map-viewer compare before.js after.js --ai
```

## Project

This package is the CLI for the [Source Map Viewer](https://source-map-viewer.void.app) project.
