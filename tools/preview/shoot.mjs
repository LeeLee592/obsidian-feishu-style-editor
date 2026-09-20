/**
 * Captures the README screenshots from the pages shots.mjs just wrote.
 *
 *   node shots.mjs && node shoot.mjs
 *
 * `render-menus.html` becomes `screenshot-block-menu.png`, `render-toolbar.html`
 * becomes `screenshot-toolbar.png`, both at 2× so the images stay crisp on a
 * HiDPI screen. Chrome is taken from $CHROME, or from the usual macOS install.
 *
 * Self-contained on purpose: the capture runs headless, so regenerating the
 * README images never touches the Obsidian window someone is working in.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const CHROME =
	process.env.CHROME ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** [page, output, width, height, scale] */
const SHOTS = [
	['render-menus.html', 'screenshot-block-menu.png', 660, 440, 2],
	['render-toolbar.html', 'screenshot-toolbar.png', 420, 160, 2],
];

const WAIT_MS = 30_000;
const POLL_MS = 200;

function capture(page, out, width, height, scale) {
	return new Promise((resolve, reject) => {
		const profile = join(
			process.env.TMPDIR ?? '/tmp',
			`fse-shot-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
		);
		const chrome = spawn(
			CHROME,
			[
				'--headless=new',
				'--disable-gpu',
				'--no-sandbox',
				'--no-first-run',
				'--disable-extensions',
				`--user-data-dir=${profile}`,
				'--hide-scrollbars',
				`--force-device-scale-factor=${scale}`,
				`--screenshot=${out}`,
				`--window-size=${width},${height}`,
				`file://${page}`,
			],
			{ stdio: 'ignore' },
		);

		const started = Date.now();
		const tick = setInterval(() => {
			const done = existsSync(out) && statSync(out).size > 1024;
			if (done || Date.now() - started > WAIT_MS) {
				clearInterval(tick);
				chrome.kill('SIGKILL');
				rmSync(profile, { recursive: true, force: true });
				if (done) {
					resolve();
				} else {
					reject(new Error(`${page}: no screenshot after ${WAIT_MS}ms`));
				}
			}
		}, POLL_MS);
	});
}

if (!existsSync(CHROME)) {
	console.error(`Chrome not found at ${CHROME}; set $CHROME to a binary.`);
	process.exit(1);
}

mkdirSync(root, { recursive: true });
for (const [page, out, width, height, scale] of SHOTS) {
	const pagePath = join(here, page);
	if (!existsSync(pagePath)) {
		console.error(`${page} is missing — run "node shots.mjs" first.`);
		process.exit(1);
	}
	const target = join(root, out);
	rmSync(target, { force: true });
	await capture(pagePath, target, width, height, scale);
	console.log(`wrote ${out}`);
}
