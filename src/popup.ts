import { setIcon } from 'obsidian';

export type PopupMode = 'list' | 'toolbar';

/** A coloured icon tile, the way Feishu's menus distinguish block kinds. */
export type PopupAccent =
	| 'blue'
	| 'purple'
	| 'green'
	| 'orange'
	| 'red'
	| 'yellow'
	| 'cyan'
	| 'plain';

export interface PopupItem {
	id: string;
	label: string;
	icon: string;
	description?: string;
	/** Optional keyboard hint shown on the right, e.g. "⌘B". */
	shortcut?: string;
	/** Trailing affordance for entries that open a further choice. */
	hasSubmenu?: boolean;
	accent?: PopupAccent;
	/** True for the block the caret already sits in, tinted like Feishu does. */
	active?: boolean;
	onSelect: () => void;
}

export type PopupLayout = 'list' | 'icons';

/** Rendering options that depend on the user's settings and the menu kind. */
export interface PopupOptions {
	/** Tint every icon with the hue of its block kind, as Feishu does. */
	coloredIcons?: boolean;
	/**
	 * Renders Feishu's keyword field above the list. The editor keeps the
	 * real caret, so this row only mirrors what has been typed.
	 */
	search?: {
		/** What the document holds: the trigger slash plus any keyword. */
		value: string;
		/** Grey hint trailing the value while no keyword has been typed. */
		hint?: string;
	};
	/** Accessible name for the popup, in the interface language. */
	ariaLabel?: string;
}

export interface PopupSection {
	/** Omitted for a section without a heading. */
	title?: string;
	items: PopupItem[];
	/**
	 * `icons` renders a compact icon-only grid (Feishu's basic palette),
	 * `list` renders icon + label rows.
	 */
	layout?: PopupLayout;
	/**
	 * Draws a hairline before this group. Only meaningful in `toolbar` mode,
	 * where Feishu separates its segments the same way.
	 */
	divider?: boolean;
}

/**
 * One floating menu per window/document, shared by every editor view and
 * released when the last view that borrowed it goes away. Keeping a single
 * element avoids a growing pile of hidden popups in the document body.
 */
const popupRegistry = new WeakMap<Document, { popup: Popup; refs: number }>();

export function acquirePopup(doc: Document): Popup {
	const existing = popupRegistry.get(doc);
	if (existing) {
		existing.refs += 1;
		return existing.popup;
	}
	const popup = new Popup(doc);
	popupRegistry.set(doc, { popup, refs: 1 });
	return popup;
}

export function releasePopup(doc: Document, popup: Popup): void {
	const entry = popupRegistry.get(doc);
	if (!entry || entry.popup !== popup) {
		return;
	}
	entry.refs -= 1;
	if (entry.refs <= 0) {
		popup.destroy();
		popupRegistry.delete(doc);
	}
}

/**
 * A floating menu rendered into the document body, positioned in viewport
 * coordinates (`position: fixed`). One instance is owned by each editor view
 * plugin and reused for every menu kind.
 */
export class Popup {
	readonly el: HTMLDivElement;
	private readonly searchEl: HTMLDivElement;
	private readonly searchTextEl: HTMLSpanElement;
	private readonly searchHintEl: HTMLSpanElement;
	private readonly listEl: HTMLUListElement;
	private items: PopupItem[] = [];
	private selected = 0;
	private mode: PopupMode = 'list';
	private iconGrid = false;
	private visible = false;

	constructor(doc: Document) {
		this.el = doc.body.createDiv({ cls: 'fse-popup' });
		// Feishu's slash menu opens with a keyword field showing the typed
		// slash; the "+" panel has no such row, which is what tells the two
		// menus apart at a glance.
		this.searchEl = this.el.createDiv({ cls: 'fse-popup-search' });
		this.searchTextEl = this.searchEl.createSpan({
			cls: 'fse-popup-search-text',
		});
		this.searchHintEl = this.searchEl.createSpan({
			cls: 'fse-popup-search-hint',
		});
		this.searchEl.hide();
		this.listEl = this.el.createEl('ul', { cls: 'fse-popup-list' });
		this.el.addEventListener('mousedown', (evt) => evt.preventDefault());
		this.el.hide();
	}

	get isVisible(): boolean {
		return this.visible;
	}

	/** True while the content holds an icon-only grid, which arrow keys walk. */
	get usesIconGrid(): boolean {
		return this.iconGrid;
	}

	setContent(
		sections: PopupSection[],
		mode: PopupMode = 'list',
		options: PopupOptions = {},
	): void {
		this.items = sections.flatMap((section) => section.items);
		this.selected = 0;
		this.mode = mode;
		this.iconGrid =
			mode === 'list' &&
			sections.some(
				(section) => (section.layout ?? 'list') === 'icons',
			);
		this.listEl.empty();
		// The element outlives its content: without this a menu reopened from
		// a scrolled state would start halfway down, hiding its first rows.
		this.el.scrollTop = 0;
		this.el.toggleClass('fse-popup-toolbar', mode === 'toolbar');
		this.el.toggleClass('fse-icons-colored', options.coloredIcons === true);
		this.el.setAttr('role', mode === 'toolbar' ? 'toolbar' : 'listbox');
		this.el.setAttr(
			'aria-label',
			options.ariaLabel ??
				(mode === 'toolbar' ? 'Formatting' : 'Block menu'),
		);
		this.renderSearch(options.search);
		for (const section of sections) {
			if (section.items.length === 0) {
				continue;
			}
			if (mode === 'toolbar') {
				const group = this.listEl.createDiv({
					cls: 'fse-popup-group fse-popup-group-row',
				});
				if (section.divider) {
					group.setAttr('data-divider', 'true');
				}
				for (const item of section.items) {
					this.renderItem(item, mode, group, 'list');
				}
				continue;
			}
			const layout = section.layout ?? 'list';
			const group = section.title
				? this.listEl.createEl('section', { cls: 'fse-popup-section' })
				: this.listEl;
			group.createDiv({
				cls: `fse-popup-group fse-popup-group-${layout}`,
			});
			const list = group.lastElementChild as HTMLElement;
			if (section.title) {
				group.insertBefore(
					group.createDiv({
						cls: 'fse-popup-section-title',
						text: section.title,
					}),
					list,
				);
			}
			for (const item of section.items) {
				this.renderItem(item, mode, list, layout);
			}
		}
		this.updateActive();
	}

	/**
	 * The keyword row mirrors what the document holds after the slash — the
	 * slash itself plus the filter — and trails the grey hint while nothing
	 * has been typed yet. The editor owns the caret, so the row never takes
	 * focus, it only shows the filter.
	 */
	private renderSearch(search: PopupOptions['search']): void {
		if (!search) {
			this.searchEl.hide();
			return;
		}
		this.searchTextEl.setText(search.value);
		const hint = search.hint ?? '';
		this.searchHintEl.setText(hint);
		this.searchHintEl.toggleClass('is-hidden', hint === '');
		// The typed filter is already in the document, so announcing it here
		// would only repeat the editor to a screen reader.
		this.searchEl.setAttr('aria-hidden', 'true');
		this.searchEl.show();
	}

	setSelected(index: number): void {
		if (this.items.length === 0) {
			return;
		}
		this.selected =
			((index % this.items.length) + this.items.length) % this.items.length;
		this.updateActive();
	}

	get selectedIndex(): number {
		return this.selected;
	}

	moveSelection(delta: number): void {
		this.setSelected(this.selected + delta);
	}

	selectCurrent(): void {
		this.items[this.selected]?.onSelect();
	}

	show(): void {
		this.visible = true;
		this.el.show();
	}

	hide(): void {
		this.visible = false;
		this.el.hide();
	}

	/**
	 * Place the menu in viewport coordinates, flipping above the anchor when
	 * `above` is set (used by the selection toolbar).
	 */
	positionAt(x: number, y: number, above = false, gap = 8): void {
		const rect = this.el.getBoundingClientRect();
		const win = this.el.win;
		const margin = 8;
		const height = rect.height;
		const width = rect.width;

		let left = x;
		if (left + width > win.innerWidth - margin) {
			left = win.innerWidth - width - margin;
		}
		if (left < margin) {
			left = margin;
		}

		let top: number;
		if (above) {
			top = y - height - gap;
			// Not enough room above: drop below the anchor instead of jumping
			// to the top of the window.
			if (top < margin) {
				top = y + gap;
			}
		} else {
			top = y;
		}
		if (top + height > win.innerHeight - margin) {
			top = Math.max(margin, win.innerHeight - height - margin);
		}
		if (top < margin) {
			top = margin;
		}

		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
	}

	/**
	 * Keep the menu inside the viewport after the document scrolled under it.
	 */
	clampPosition(): void {
		if (!this.visible) {
			return;
		}
		const rect = this.el.getBoundingClientRect();
		const win = this.el.win;
		if (rect.bottom > win.innerHeight - 8) {
			this.positionAt(rect.left, win.innerHeight - rect.height - 8);
		}
	}

	destroy(): void {
		this.items = [];
		this.visible = false;
		this.el.remove();
	}

	private renderItem(
		item: PopupItem,
		mode: PopupMode,
		parent: HTMLElement,
		layout: PopupLayout = 'list',
	): void {
		const li = parent.createEl('li', { cls: 'fse-popup-item' });
		const attr: Record<string, string> = {
			type: 'button',
			'data-item-id': item.id,
		};
		if (mode === 'toolbar') {
			attr['aria-label'] = item.label;
			attr.title = item.label;
		}
		const button = li.createEl('button', {
			cls: 'fse-popup-item-button',
			attr,
		});
		button.toggleClass('is-current', item.active === true);

		const tile = button.createSpan({
			cls: 'fse-popup-item-tile',
			attr: { 'data-accent': item.accent ?? 'plain' },
		});
		setIcon(tile, item.icon);

		if (mode === 'toolbar') {
			this.bindSelection(button, item);
			return;
		}

		li.setAttr('role', 'option');
		if (layout === 'icons') {
			// An icon grid carries no room for a label, so the name lives in
			// the tooltip and the accessible label instead.
			button.toggleClass('is-icon', true);
			button.setAttr('aria-label', item.label);
			button.setAttr('title', tooltip(item));
			this.bindSelection(button, item);
			return;
		}

		button.setAttr('title', tooltip(item));
		const body = button.createSpan({ cls: 'fse-popup-item-body' });
		const title = body.createSpan({ cls: 'fse-popup-item-label' });
		title.setText(item.label);
		if (item.shortcut) {
			button.createSpan({
				cls: 'fse-popup-item-shortcut',
				text: item.shortcut,
			});
		}
		if (item.hasSubmenu) {
			const chevron = button.createSpan({
				cls: 'fse-popup-item-chevron',
			});
			setIcon(chevron, 'chevron-right');
		}
		this.bindSelection(button, item);
	}

	private bindSelection(button: HTMLButtonElement, item: PopupItem): void {
		button.addEventListener('mousemove', () => {
			const index = this.items.indexOf(item);
			if (index >= 0) {
				this.setSelected(index);
			}
		});
		button.addEventListener('click', (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			item.onSelect();
		});
	}

	private updateActive(): void {
		if (this.mode === 'toolbar') {
			// A toolbar has no cursor, so no button is the selected one: the
			// arrow keys stay with the editor while it is up.
			return;
		}
		const buttons = this.listEl.querySelectorAll<HTMLElement>(
			'.fse-popup-item-button',
		);
		buttons.forEach((el, index) => {
			const active = index === this.selected;
			el.toggleClass('is-active', active);
			el.setAttr('aria-selected', active ? 'true' : 'false');
			if (active) {
				el.scrollIntoView({ block: 'nearest' });
			}
		});
	}
}

/** Hover text for an entry: its name, plus what it inserts when known. */
function tooltip(item: PopupItem): string {
	return item.description ? `${item.label} — ${item.description}` : item.label;
}
