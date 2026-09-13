import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pluginId = 'feishu-style-editor';
const files = ['main.js', 'manifest.json', 'styles.css'];
const pluginDir = join(root, 'Test', '.obsidian', 'plugins', pluginId);

if (!existsSync(join(root, 'main.js'))) {
	console.error('main.js not found. Run "pnpm run build" first.');
	process.exit(1);
}

mkdirSync(pluginDir, { recursive: true });
for (const file of files) {
	copyFileSync(join(root, file), join(pluginDir, file));
}

// Ensure the plugin is enabled in the test vault, without clobbering other
// community plugins the user may have enabled there.
const communityPluginsPath = join(root, 'Test', '.obsidian', 'community-plugins.json');
const enabled = [];
if (existsSync(communityPluginsPath)) {
	try {
		const parsed = JSON.parse(readFileSync(communityPluginsPath, 'utf8'));
		if (Array.isArray(parsed)) {
			enabled.push(...parsed);
		}
	} catch {
		// Ignore a malformed file and start fresh.
	}
}
if (!enabled.includes(pluginId)) {
	enabled.push(pluginId);
	writeFileSync(communityPluginsPath, JSON.stringify(enabled, null, '\t') + '\n');
}

console.log(`Deployed ${pluginId} to ${pluginDir}`);
