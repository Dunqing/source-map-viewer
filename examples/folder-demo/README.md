# Folder Demo

This folder is a manual test fixture for folder-aware loading.

It intentionally exercises:

- a root-relative `sourceMappingURL` in `js/bundle.js`
- a root-relative `file` field in `maps/app.js.map`
- missing `sourcesContent`, which should be hydrated from `src/input.ts`

How to try it:

1. Start the app from the repo root with `vp dev`.
2. In the UI, click `Upload Folder`.
3. Select this folder: `examples/folder-demo`.

Expected result:

- the generated panel shows `js/bundle.js`
- the original panel shows `src/input.ts`
- the visualization opens without a missing-source-map error
