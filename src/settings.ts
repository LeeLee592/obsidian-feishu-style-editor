import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type FeishuStyleEditor from './main';

export interface FeishuStyleEditorSettings {
	slashCommands: boolean;
	blockHandle: boolean;
	bubbleToolbar: boolean;
}

export const DEFAULT_SETTINGS: FeishuStyleEditorSettings = {
	slashCommands: true,
	blockHandle: true,
	bubbleToolbar: true,
};

export class FeishuStyleEditorSettingTab extends PluginSettingTab {
	plugin: FeishuStyleEditor;

	constructor(app: App, plugin: FeishuStyleEditor) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Slash commands',
				desc: 'Type "/" to open a menu of blocks to insert.',
				aliases: ['slash', 'menu', 'blocks'],
				control: { type: 'toggle', key: 'slashCommands' },
			},
			{
				name: 'Block handle',
				desc: 'Show a "+" handle next to the current line to insert or transform blocks.',
				aliases: ['plus', 'add block'],
				control: { type: 'toggle', key: 'blockHandle' },
			},
			{
				name: 'Floating toolbar',
				desc: 'Show a formatting toolbar when text is selected.',
				aliases: ['bubble', 'selection toolbar'],
				control: { type: 'toggle', key: 'bubbleToolbar' },
			},
		];
	}
}
