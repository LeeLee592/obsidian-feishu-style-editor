/**
 * Preview entry for the README screenshots: mounts the real Popup with the
 * same sections feishu.ts assembles, one per `[data-shot]` slot.
 */

import {
	CALLOUT_KINDS,
	INLINE_ACTIONS,
	activeBlockId,
	blockSections,
	commandDescription,
	commandLabel,
	sectionTitle,
} from '../../src/commands';
import { pick } from '../../src/i18n';
import { Popup } from '../../src/popup';

const noop = () => {};

const COLORED = { coloredIcons: true };

function baseItem(command, current) {
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

/** feishu.ts buildSlashSections, with no query typed. */
function slashSections(current) {
	return blockSections().map((section) => ({
		title: sectionTitle(section),
		layout: 'list',
		items: section.commands.map((command) => baseItem(command, current)),
	}));
}

/** feishu.ts openBlockMenu: the "+" panel keeps each section's own layout. */
function insertSections(current) {
	return blockSections().map((section) => ({
		title: sectionTitle(section),
		layout: section.layout,
		items: section.commands
			.filter(
				(command) => section.layout !== 'icons' || command.tile === true,
			)
			.map((command) => baseItem(command, current)),
	}));
}

/** feishu.ts refreshBubble. */
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
	host.appendChild(popup.el);
}

export function renderShots() {
	globalThis.FSE_LANG = 'zh';
	// The sample line is a plain paragraph, so "Text" carries Feishu's chip.
	const current = activeBlockId('普通正文段落');
	for (const host of document.querySelectorAll('[data-shot]')) {
		const kind = host.getAttribute('data-shot');
		if (kind === 'slash') {
			mount(host, slashSections(current), 'list', {
				...COLORED,
				search: {
					value: '/',
					hint: pick('Type a keyword', '输入关键词'),
				},
				ariaLabel: pick('Block menu', '块菜单'),
			});
			continue;
		}
		if (kind === 'insert') {
			mount(host, insertSections(current), 'list', {
				...COLORED,
				ariaLabel: pick('Insert block', '插入块'),
			});
			continue;
		}
		if (kind === 'toolbar') {
			mount(host, toolbarSections(), 'toolbar', COLORED);
			continue;
		}
		throw new Error(`unknown shot: ${kind}`);
	}
}

globalThis.FSE_SHOTS = { CALLOUT_KINDS };
