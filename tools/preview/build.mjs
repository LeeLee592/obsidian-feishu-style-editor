/**
 * Builds the browser preview of the plugin's popup code:
 *
 *   node build.mjs   -> preview-menus.html, preview-menus-dark.html
 *
 * Open the pages in a browser to eyeball a change to the menus, the palette
 * or the colours; `pnpm run screenshots` captures the README images from the
 * same pipeline. One panel per menu kind, in both themes.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { here, renderPage } from './render.mjs';

const PANELS = [
	['slash', 'slash menu — en, no query', 'en', ''],
	['slash', 'slash menu — zh, filtering "标题"', 'zh', '标题'],
	['insert', '“+” panel — zh', 'zh', ''],
	['insert', '“+” panel — en', 'en', ''],
	['convert', 'turn into', 'zh', ''],
	['callout', 'callout submenu', 'zh', ''],
	['toolbar', 'selection toolbar', 'zh', ''],
];

const CSS = `
	.preview-grid { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
	.preview-card { display: flex; flex-direction: column; }
	.preview-label { font-size: 12px; opacity: 0.6; margin: 0 0 8px; font-family: var(--font-interface); }
	body { padding: 28px; }
`;

const cards = PANELS.map(
	([kind, title, lang, query]) => `
		<div class="preview-card">
			<p class="preview-label">${title}</p>
			<div data-panel="${kind}"${kind === 'slash' ? ` data-query="${query}"` : ''} data-lang="${lang}"></div>
		</div>`,
).join('');

for (const theme of ['light', 'dark']) {
	const page = await renderPage({
		entry: 'entry.mjs',
		body: `<div class="preview-grid">${cards}</div>`,
		css: CSS,
		globals: 'globalThis.FSE_PREVIEW = { env: { coloredIcons: true } };',
		run: 'globalThis.FSE_BUNDLE.renderAll();',
		theme,
		title: `fse preview ${theme}`,
	});
	const file = join(here, `preview-menus${theme === 'dark' ? '-dark' : ''}.html`);
	await writeFile(file, page);
	console.log(`wrote ${file}`);
}
