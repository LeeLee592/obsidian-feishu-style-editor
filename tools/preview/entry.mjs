/**
 * Preview entry: renders the plugin's real Popup with the real command
 * tables, once per menu kind, so the CSS can be checked in a browser.
 *
 * The section assembly mirrors feishu.ts (that file cannot run outside
 * CodeMirror); everything below it — popup.ts, commands.ts, i18n.ts — is the
 * shipping code.
 */

import {
	BLOCK_COMMANDS,
	CALLOUT_KINDS,
	INLINE_ACTIONS,
	blockSections,
	calloutCommand,
	commandDescription,
	commandLabel,
	commandMatches,
	sectionTitle,
} from '../../src/commands';
import { pick } from '../../src/i18n';
import { Popup } from '../../src/popup';

const noop = () => {};

function blockItem(command, current) {
	return {
		id: command.id,
		label: commandLabel(command),
		icon: command.icon,
		description: commandDescription(command),
		shortcut: command.shortcut,
		hasSubmenu: command.hasSubmenu,
		accent: command.accent,
		active: command.id === current,
		onSelect: noop,
	};
}

function slashItem(command, current) {
	return { ...blockItem(command, current), hasSubmenu: false };
}

function typeSections(current, build) {
	return blockSections().map((section) => ({
		title: sectionTitle(section),
		layout: 'list',
		items: section.commands.map((command) => build(command, current)),
	}));
}

/** feishu.ts buildSlashSections */
function slashSections(query, current) {
	if (query.trim() !== '') {
		return [
			{
				items: BLOCK_COMMANDS.filter((command) =>
					commandMatches(command, query),
				).map((command) => slashItem(command, current)),
			},
		];
	}
	return typeSections(current, slashItem);
}

/** feishu.ts openBlockMenu */
function insertSections(current) {
	return blockSections().map((section) => ({
		title: sectionTitle(section),
		layout: section.layout,
		items: section.commands
			.filter(
				(command) => section.layout !== 'icons' || command.tile === true,
			)
			.map((command) => blockItem(command, current)),
	}));
}

/** feishu.ts openConvertMenu */
function convertSections(current) {
	return typeSections(current, blockItem);
}

function calloutSections() {
	return [
		{
			items: CALLOUT_KINDS.map((kind) => ({
				id: `callout-${kind.type}`,
				label: pick(kind.label, kind.labelZh),
				icon: kind.icon,
				accent: kind.accent,
				onSelect: noop,
			})),
		},
	];
}

function toolbarSections() {
	const inline = (action) => ({
		id: action.id,
		label: pick(action.label, action.labelZh),
		icon: action.icon,
		shortcut: action.shortcut,
		onSelect: noop,
	});
	const inlineIds = new Set(['bold', 'italic', 'underline', 'strikethrough']);
	return [
		{
			items: [
				{
					id: 'convert-block',
					label: pick('Turn into', '转换为'),
					icon: 'text-cursor-input',
					hasSubmenu: true,
					onSelect: noop,
				},
			],
		},
		{
			divider: true,
			items: INLINE_ACTIONS.filter((a) => inlineIds.has(a.id)).map(inline),
		},
		{
			divider: true,
			items: INLINE_ACTIONS.filter((a) => !inlineIds.has(a.id)).map(inline),
		},
	];
}

function mount(host, sections, mode, options) {
	const popup = new Popup(document);
	popup.setContent(sections, mode, options);
	popup.show();
	popup.el.style.position = 'static';
	popup.el.setAttr('data-preview', 'popup');
	host.appendChild(popup.el);
}

/** Renders one panel per mount point declared in the page. */
export function renderAll() {
	const { env } = globalThis.FSE_PREVIEW;
	for (const host of document.querySelectorAll('[data-panel]')) {
		const kind = host.getAttribute('data-panel');
		const lang = host.getAttribute('data-lang');
		globalThis.FSE_LANG = lang ?? 'en';
		const colored = { coloredIcons: env.coloredIcons !== false };
		if (kind === 'slash') {
			const query = host.getAttribute('data-query') ?? '';
			mount(host, slashSections(query, 'heading-2'), 'list', {
				...colored,
				search: {
					value: `/${query}`,
					hint:
						query === ''
							? pick('Type a keyword', '输入关键词')
							: undefined,
				},
				ariaLabel: pick('Block menu', '块菜单'),
			});
			continue;
		}
		if (kind === 'insert') {
			mount(host, insertSections('text'), 'list', {
				...colored,
				ariaLabel: pick('Insert block', '插入块'),
			});
			continue;
		}
		if (kind === 'convert') {
			mount(host, convertSections('bullet-list'), 'list', {
				...colored,
				ariaLabel: pick('Turn into', '转换为'),
			});
			continue;
		}
		if (kind === 'callout') {
			mount(host, calloutSections(), 'list', {
				...colored,
				ariaLabel: pick('Callout type', '提示块类型'),
			});
			continue;
		}
		if (kind === 'toolbar') {
			mount(host, toolbarSections(), 'toolbar', colored);
			continue;
		}
		throw new Error(`unknown panel: ${kind}`);
	}
}

globalThis.FSE = { renderAll, calloutCommand, BLOCK_COMMANDS };
