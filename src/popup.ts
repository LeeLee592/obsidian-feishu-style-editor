import { setIcon } from 'obsidian';

export type PopupMode = 'list' | 'toolbar';

export interface PopupItem {
	id: string;
	label: string;
	icon: string;
	description?: string;
	onSelect: () => void;
}

export class Popup {
	readonly el: HTMLDivElement;
	private readonly listEl: HTMLUListElement;
	private items: PopupItem[] = [];
	private selected = 0;

	constructor(doc: Document) {
		this.el = doc.createDiv({ cls: 'fse-popup' });
		this.listEl = this.el.createEl('ul', { cls: 'fse-popup-list' });
		this.el.addEventListener('mousedown', (evt) => evt.preventDefault());
		doc.body.appendChild(this.el);
		this.el.hide();
	}

	setItems(items: PopupItem[], mode: PopupMode = 'list'): void {
		this.items = items;
		this.selected = 0;
		this.listEl.empty();
		this.el.toggleClass('fse-popup-toolbar', mode === 'toolbar');
		this.el.setAttr('role', mode === 'toolbar' ? 'toolbar' : 'listbox');
		this.el.setAttr('aria-label', mode === 'toolbar' ? 'Formatting' : 'Block menu');

		for (const item of items) {
			this.renderItem(item, mode);
		}
		this.updateActive();
	}

	setSelected(index: number): void {
		if (this.items.length === 0) {
			return;
		}
		const wrapped =
			((index % this.items.length) + this.items.length) % this.items.length;
		this.selected = wrapped;
		this.updateActive();
	}

	moveSelection(delta: number): void {
		this.setSelected(this.selected + delta);
	}

	selectCurrent(): void {
		this.items[this.selected]?.onSelect();
	}

	show(): void {
		this.el.show();
	}

	hide(): void {
		this.el.hide();
	}

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
		if (top < 8) {
			top = 8;
		}
		if (top + rect.height > win.innerHeight - 8) {
			top = win.innerHeight - rect.height - 8;
		}
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
	}

	destroy(): void {
		this.el.remove();
	}

	private renderItem(item: PopupItem, mode: PopupMode): void {
		const li = this.listEl.createEl('li', { cls: 'fse-popup-item' });
		if (mode === 'toolbar') {
			const button = li.createEl('button', {
				cls: 'fse-popup-item-button',
				attr: { type: 'button', 'aria-label': item.label, title: item.label },
			});
			const iconEl = button.createSpan({ cls: 'fse-popup-item-icon' });
			setIcon(iconEl, item.icon);
			this.bindSelection(button, item);
			return;
		}

		li.setAttr('role', 'option');
		const button = li.createEl('button', {
			cls: 'fse-popup-item-button',
			attr: { type: 'button' },
		});
		const iconEl = button.createSpan({ cls: 'fse-popup-item-icon' });
		setIcon(iconEl, item.icon);
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
		button.addEventListener('click', () => item.onSelect());
	}

	private updateActive(): void {
		const buttons = this.listEl.querySelectorAll<HTMLElement>(
			'.fse-popup-item-button',
		);
		buttons.forEach((el, index) => {
			const active = index === this.selected;
			el.toggleClass('is-active', active);
			el.setAttr('aria-selected', active ? 'true' : 'false');
		});
	}
}
