import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { pick } from './i18n';
import type FeishuStyleEditor from './main';

export interface FeishuStyleEditorSettings {
	slashCommands: boolean;
	blockHandle: boolean;
	bubbleToolbar: boolean;
	coloredIcons: boolean;
}

export const DEFAULT_SETTINGS: FeishuStyleEditorSettings = {
	slashCommands: true,
	blockHandle: true,
	bubbleToolbar: true,
	// Feishu's own block icons are coloured, so the palette matches by default.
	coloredIcons: true,
};

type BooleanSettingKey =
	| 'slashCommands'
	| 'blockHandle'
	| 'bubbleToolbar'
	| 'coloredIcons';

export class FeishuStyleEditorSettingTab extends PluginSettingTab {
	plugin: FeishuStyleEditor;

	constructor(app: App, plugin: FeishuStyleEditor) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: pick('Slash commands', '斜杠命令'),
				desc: pick(
					'Type "/" at the start of a line or after a space to search the block menu.',
					'在行首或空格后输入 "/"，打开可搜索的块菜单。',
				),
				aliases: ['slash', 'menu', 'blocks', '斜杠', '菜单'],
				control: { type: 'toggle', key: 'slashCommands' },
			},
			{
				name: pick('Block handle', '行前手柄'),
				desc: pick(
					'Show a "+" handle next to the current line that opens the insert panel.',
					'在当前行左侧显示 "+" 手柄，点击打开插入面板。',
				),
				aliases: ['plus', 'add block', '手柄', '插入'],
				control: { type: 'toggle', key: 'blockHandle' },
			},
			{
				name: pick('Floating toolbar', '悬浮工具栏'),
				desc: pick(
					'Show a formatting toolbar when text is selected.',
					'选中文本时显示格式工具栏。',
				),
				aliases: ['bubble', 'selection toolbar', '工具栏', '悬浮'],
				control: { type: 'toggle', key: 'bubbleToolbar' },
			},
			{
				name: pick('Colored block icons', '彩色块图标'),
				desc: pick(
					'Tint each labelled row with the colour of its kind, as Feishu does. The "+" panel icon grid stays monochrome; off keeps every icon monochrome.',
					'按块类型给列表行的图标上色（飞书同款配色）；"+" 面板的图标宫格保持单色，关闭后全部单色。',
				),
				aliases: ['color', 'icons', 'palette', '颜色', '图标'],
				control: { type: 'toggle', key: 'coloredIcons' },
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as BooleanSettingKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const patch: Partial<Record<BooleanSettingKey, boolean>> = {
			[key as BooleanSettingKey]: value === true,
		};
		await this.plugin.updateSettings(patch);
	}
}
