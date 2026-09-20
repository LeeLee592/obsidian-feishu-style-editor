import { getLanguage } from 'obsidian';

/** Interface languages this plugin ships strings for. */
export type UiLang = 'en' | 'zh';

export function currentLang(): UiLang {
	return getLanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Picks the string for the language Obsidian is running in. */
export function pick(en: string, zh: string): string {
	return currentLang() === 'zh' ? zh : en;
}
