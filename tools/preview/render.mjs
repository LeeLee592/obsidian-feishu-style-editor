/**
 * Shared plumbing for the preview pages.
 *
 * Both pages render the plugin's shipping UI code — `popup.ts`, `commands.ts`,
 * `i18n.ts` and the real `styles.css` — in a plain browser page, so a menu can
 * be eyeballed without starting Obsidian. The bundle is esbuild's, with
 * `obsidian` aliased to obsidian-stub.mjs, and the icons are the lucide SVGs
 * Obsidian itself ships, cached in icons/.
 */

import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, '..', '..');

const iconDir = join(here, 'icons');

/* Obsidian's own defaults for the variables styles.css reads. */
const OBSIDIAN_VARS = `
	--layer-menu: 30;
	--size-2-1: 2px; --size-2-2: 4px; --size-2-3: 6px;
	--size-4-1: 4px; --size-4-2: 8px; --size-4-3: 12px;
	--radius-s: 4px; --radius-m: 8px; --radius-l: 12px;
	--font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px;
	--font-normal: 400; --font-medium: 500;
	--font-interface: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
`;

/** Maps icon id -> inline SVG, the way Obsidian's own setIcon() resolves one. */
async function loadIcons() {
	const map = {};
	for (const file of await readdir(iconDir)) {
		if (!file.endsWith('.svg')) {
			continue;
		}
		const raw = await readFile(join(iconDir, file), 'utf8');
		map[file.replace(/\.svg$/, '')] = raw
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\s(class|width|height)="[^"]*"/g, '')
			.trim();
	}
	return map;
}

async function bundle(entry) {
	const result = await build({
		entryPoints: [join(here, entry)],
		bundle: true,
		format: 'iife',
		globalName: 'FSE_BUNDLE',
		platform: 'browser',
		target: 'es2021',
		write: false,
		alias: { obsidian: join(here, 'obsidian-stub.mjs') },
	});
	return result.outputFiles[0].text;
}

/**
 * A complete page: the plugin stylesheet, the icons, the bundle, and the
 * `run` snippet that draws the panels the body declares.
 */
export async function renderPage({
	entry,
	body,
	/** Page-level CSS, applied before the plugin's own. */
	css = '',
	/** Extra globals the entry reads, as a script-body fragment. */
	globals = '',
	/** Bundle function to call once the page is laid out. */
	run,
	theme = 'light',
	title = 'fse preview',
}) {
	const [js, styles, icons] = await Promise.all([
		bundle(entry),
		readFile(join(root, 'styles.css'), 'utf8'),
		loadIcons(),
	]);
	const dark = theme === 'dark';
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
	body { ${OBSIDIAN_VARS} }
	body {
		margin: 0;
		background: ${dark ? '#1e1e1e' : '#f6f7f9'};
		font-family: var(--font-interface);
	}
	${css}
</style>
<style>${styles}</style>
</head>
<body class="${dark ? 'theme-dark' : ''}">
	${body}
	<script>globalThis.FSE_ICONS = ${JSON.stringify(icons)};${globals}</script>
	<script>${js}</script>
	<script>${run}</script>
</body></html>`;
}
