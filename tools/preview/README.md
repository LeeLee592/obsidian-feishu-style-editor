# Preview & screenshots

Offline harness for the plugin's UI: it renders the **real** `popup.ts`,
`commands.ts` and `styles.css` in a plain page, with `obsidian` aliased to
`obsidian-stub.mjs` and the lucide SVGs from `icons/` (the same glyphs
Obsidian ships). Nothing here touches a running Obsidian.

```bash
node build.mjs     # -> preview-menus.html, preview-menus-dark.html
node shots.mjs     # -> render-menus.html, render-toolbar.html
node shoot.mjs     # -> ../../screenshot-block-menu.png, ../../screenshot-toolbar.png
```

`pnpm run preview` and `pnpm run screenshots` wrap those two steps. The
screenshot capture drives headless Chrome (from `$CHROME`, or the macOS
install) and writes the two images the README embeds.

`entry.mjs` mounts one panel per menu kind for the preview page; the section
assembly mirrors `src/feishu.ts` (that file cannot run outside CodeMirror),
while everything below it — `popup.ts`, `commands.ts`, `i18n.ts` — is the
shipping code. Keep the two in step when a menu changes.
