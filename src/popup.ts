import { setIcon } from 'obsidian';

export type PopupMode = 'list' | 'toolbar';

export interface PopupItem {
	id: string;
	label: string;
	icon: string;
	description?: string;
	onSelect: () => void;
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
	private readonly listEl: HTMLUListElement;
	private items: PopupItem[] = [];
	private selected = 0;
	private mode: PopupMode = 'list';
	private visible = false;

	constructor(doc: Document) {
		this.el = doc.body.createDiv({ cls: 'fse-popup' });
		this.listEl = this.el.createEl('ul', { cls: 'fse-popup-list' });
		this.el.addEventListener('mousedown', (evt) => evt.preventDefault());
		this.el.hide();
	}

	get isVisible(): boolean {
		return this.visible;
	}

	setContent(items: PopupItem[], mode: PopupMode = 'list'): void {
		this.items = items;
		this.selected = 0;
		this.mode = mode;
		this.listEl.empty();
		this.el.toggleClass('fse-popup-toolbar', mode === 'toolbar');
		this.el.setAttr('role', mode === 'toolbar' ? 'toolbar' : 'listbox');
		this.el.setAttr(
			'aria-label',
			mode === 'toolbar' ? 'Formatting' : 'Block menu',
		);
		for (const item of items) {
			this.renderItem(item, mode);
		}
		this.updateActive();
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
	positionAt(x: number, y: number, above = false): void {
		const rect = this.el.getBoundingClientRect();
		const win = this.el.win;
		let left = x;
		let top = above ? y - rect.height - 8 : y;
		if (left + rect.width > win.innerWidth - 8) {
			left = win.innerWidth - rect.width - 8;
		}
		if (left < 8) {
			left = 8;
		}
		if (top + rect.height > win.innerHeight - 8) {
			top = above ? Math.max(8, y + 8) : win.innerHeight - rect.height - 8;
		}
		if (top < 8) {
			top = 8;
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

	private renderItem(item: PopupItem, mode: PopupMode): void {
		const li = this.listEl.createEl('li', { cls: 'fse-popup-item' });
		const button = li.createEl('button', {
			cls: 'fse-popup-item-button',
			attr:
				mode === 'toolbar'
					? { type: 'button', 'aria-label': item.label, title: item.label }
					: { type: 'button' },
		});
		const iconEl = button.createSpan({ cls: 'fse-popup-item-icon' });
		setIcon(iconEl, item.icon);

		if (mode === 'toolbar') {
			this.bindSelection(button, item);
			return;
		}

		li.setAttr('role', 'option');
		const labelEl = button.createSpan({ cls: 'fse-popup-item-label' });
		labelEl.setText(item.label);
		if (item.description) {
			const descEl = button.createSpan({ cls: 'fse-popup-item-desc' });
			descEl.setText(item.description);
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
		const buttons = this.listEl.querySelectorAll<HTMLElement>(
			'.fse-popup-item-button',
		);
		buttons.forEach((el, index) => {
			const active = index === this.selected;
			el.toggleClass('is-active', active);
			if (this.mode === 'list') {
				el.setAttr('aria-selected', active ? 'true' : 'false');
			}
			if (active) {
				el.scrollIntoView({ block: 'nearest' });
			}
		});
	}
}
