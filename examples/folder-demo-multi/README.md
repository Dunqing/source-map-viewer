# Folder Demo: Multiple Entrypoints

This folder is a manual test fixture for the current ambiguous-folder behavior.

It intentionally contains two independent source map entrypoints:

- `js/alpha.js` + `maps/alpha.js.map`
- `js/beta.js` + `maps/beta.js.map`

How to try it:

1. Start the app from the repo root with `vp dev`.
2. In the UI, click `Upload`, then choose `Folder`.
3. Select this folder: `examples/folder-demo-multi`.

Expected result:

- the app should reject the folder
- the error should mention `Multiple source map entrypoints found`

CLI:

```bash
vp run --filter source-map-viewer build
node packages/cli/dist/cli.js examples/folder-demo-multi
```

Expected result:

- the CLI should fail with the same ambiguity error
