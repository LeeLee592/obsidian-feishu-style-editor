/**
 * Builds the two README screenshot pages from the plugin's real popup code:
 *
 *   node shots.mjs && node shoot.mjs
 *
 * `render-menus.html` shows the "/" menu next to the "+" panel, which is the
 * pair the README contrasts; `render-toolbar.html` shows the selection
 * toolbar. Same pipeline as build.mjs — the actual `popup.ts`, `commands.ts`
 * and `styles.css` — only the framing differs.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { here, renderPage } from './render.mjs';

const CSS = `
	body { padding: 24px; }
	.shots { display: flex; align-items: flex-start; gap: 28px; }
	.caption { font-size: 12px; color: #646a73; margin: 0 0 8px; }
	.slot { display: flex; flex-direction: column; }
`;

const PAGES = [
	[
		'render-menus.html',
		660,
		`<div class="shots">
			<div class="slot"><p class="caption">输入 / 打开：可搜索的块列表</p><div data-shot="slash"></div></div>
			<div class="slot"><p class="caption">点击行前 + 打开：图标宫格</p><div data-shot="insert"></div></div>
		</div>`,
	],
	[
		'render-toolbar.html',
		420,
		`<div class="shots">
			<div class="slot"><p class="caption">选中文本后弹出</p><div data-shot="toolbar"></div></div>
		</div>`,
	],
];

for (const [file, width, body] of PAGES) {
	const page = await renderPage({
		entry: 'shots-entry.mjs',
		body,
		css: `${CSS}\n\tbody { width: ${width}px; box-sizing: border-box; }`,
		run: 'globalThis.FSE_BUNDLE.renderShots();',
	});
	await writeFile(join(here, file), page);
	console.log(`wrote ${file}`);
}
