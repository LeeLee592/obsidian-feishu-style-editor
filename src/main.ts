import { Plugin } from 'obsidian';
import { feishuEditorExtension } from './feishu';
import {
	DEFAULT_SETTINGS,
	FeishuStyleEditorSettingTab,
	type FeishuStyleEditorSettings,
} from './settings';

export default class FeishuStyleEditor extends Plugin {
	settings: FeishuStyleEditorSettings = { ...DEFAULT_SETTINGS };

	async onload() {
		await this.loadSettings();

		this.registerEditorExtension(feishuEditorExtension(() => this.settings));

		this.addSettingTab(new FeishuStyleEditorSettingTab(this.app, this));
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<FeishuStyleEditorSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
	}

	async updateSettings(patch: Partial<FeishuStyleEditorSettings>) {
		this.settings = { ...this.settings, ...patch };
		await this.saveData(this.settings);
	}
}
