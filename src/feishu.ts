import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import {
	ViewPlugin,
	keymap,
	type EditorView,
	type ViewUpdate,
} from '@codemirror/view';
import {
	BLOCK_COMMANDS,
	INLINE_ACTIONS,
	type BlockCommand,
	type BuiltBlock,
} from './commands';
import { Popup, type PopupItem } from './popup';
import type { FeishuStyleEditorSettings } from './settings';

type MenuKind = 'slash' | 'block' | 'bubble';

export function feishuEditorExtension(
	getSettings: () => FeishuStyleEditorSettings,
): Extension {
	class FeishuViewPlugin {
		private readonly doc: Document;
		private readonly popup: Popup;
		private handleEl: HTMLButtonElement | null = null;
		private menuKind: MenuKind | null = null;
		private menuAnchor = 0;
		private slashTrigger: number | null = null;
		private blockLine: number | null = null;
		private handleLine: number | null = null;

		constructor(view: EditorView) {
			this.doc = view.dom.ownerDocument;
			this.popup = new Popup(this.doc);
			this.doc.addEventListener('mousedown', this.onClickAway, true);
		}

		private get settings(): FeishuStyleEditorSettings {
			return getSettings();
		}

		update(update: ViewUpdate): void {
			const view = update.view;
			if (this.menuKind === 'slash' && update.docChanged) {
				this.refreshSlashMenu(view);
			}
			if (update.selectionSet || update.docChanged) {
				if (this.settings.blockHandle) {
					this.refreshHandle(view);
				}
				if (this.settings.bubbleToolbar) {
					this.refreshBubble(view);
				}
			}
		}

		destroy(): void {
			this.doc.removeEventListener('mousedown', this.onClickAway, true);
			this.popup.destroy();
			this.handleEl?.remove();
		}

		// ---- keymap entry points ----

		openSlash(view: EditorView): boolean {
			if (!this.settings.slashCommands) {
				return false;
			}
			if (this.menuKind !== null) {
				return false;
			}
			const head = view.state.selection.main.head;
			this.slashTrigger = head;
			this.menuKind = 'slash';
			view.dispatch({
				changes: { from: head, insert: '/' },
				selection: EditorSelection.cursor(head + 1),
			});
			return true;
		}

		confirmMenu(): boolean {
			if (this.menuKind === null || this.menuKind === 'bubble') {
				return false;
			}
			this.popup.selectCurrent();
			return true;
		}

		dismissMenu(): boolean {
			if (this.menuKind === null) {
				return false;
			}
			this.closeMenu();
			return true;
		}

		moveMenu(delta: number): boolean {
			if (this.menuKind === null) {
				return false;
			}
			this.popup.moveSelection(delta);
			return true;
		}

		// ---- block handle ----

		private openBlockMenu(view: EditorView, lineNumber: number): void {
			this.blockLine = lineNumber;
			this.menuAnchor = view.state.doc.line(lineNumber).from;
			this.showMenu(view, 'block', this.buildBlockItems(view, lineNumber));
		}

		private buildBlockItems(
			view: EditorView,
			lineNumber: number,
		): PopupItem[] {
			return BLOCK_COMMANDS.map((command) => ({
				id: command.id,
				label: command.label,
				icon: command.icon,
				description: command.description,
				onSelect: () => {
					this.closeMenu();
					this.insertBlockAtLine(view, lineNumber, command.build());
				},
			}));
		}

		private insertBlockAtLine(
			view: EditorView,
			lineNumber: number,
			block: BuiltBlock,
		): void {
			const line = view.state.doc.line(lineNumber);
			if (line.text.trim() === '') {
				view.dispatch({
					changes: { from: line.from, to: line.to, insert: block.text },
					selection: EditorSelection.cursor(line.from + block.cursor),
				});
			} else {
				view.dispatch({
					changes: { from: line.from, insert: `${block.text}\n` },
					selection: EditorSelection.cursor(line.from + block.cursor),
				});
			}
			view.focus();
		}

		// ---- slash menu ----

		private refreshSlashMenu(view: EditorView): void {
			const trigger = this.slashTrigger;
			if (this.menuKind !== 'slash' || trigger === null) {
				return;
			}
			const doc = view.state.doc;
			if (
				trigger >= doc.length ||
				doc.sliceString(trigger, trigger + 1) !== '/'
			) {
				this.closeMenu();
				return;
			}
			const cursor = view.state.selection.main.head;
			if (cursor <= trigger) {
				this.closeMenu();
				return;
			}
			this.menuAnchor = cursor;
			this.showMenu(
				view,
				'slash',
				this.buildSlashItems(view, trigger, cursor),
			);
		}

		private buildSlashItems(
			view: EditorView,
			trigger: number,
			cursor: number,
		): PopupItem[] {
			const query = view.state.doc
				.sliceString(trigger + 1, Math.max(trigger + 1, cursor))
				.trim();
			const commands = this.filterCommands(query);
			return commands.map((command) => ({
				id: command.id,
				label: command.label,
				icon: command.icon,
				description: command.description,
				onSelect: () => {
					this.closeMenu();
					this.replaceRange(
						view,
						Math.min(trigger, cursor),
						Math.max(trigger, cursor),
						command.build(),
					);
				},
			}));
		}

		private filterCommands(query: string): BlockCommand[] {
			const q = query.toLowerCase();
			if (q === '') {
				return BLOCK_COMMANDS;
			}
			return BLOCK_COMMANDS.filter(
				(command) =>
					command.label.toLowerCase().includes(q) ||
					command.keywords.some((keyword) => keyword.includes(q)),
			);
		}

		private replaceRange(
			view: EditorView,
			from: number,
			to: number,
			block: BuiltBlock,
		): void {
			view.dispatch({
				changes: { from, to, insert: block.text },
				selection: EditorSelection.cursor(from + block.cursor),
			});
			view.focus();
		}

		// ---- bubble toolbar ----

		private refreshBubble(view: EditorView): void {
			const selection = view.state.selection.main;
			if (selection.empty) {
				if (this.menuKind === 'bubble') {
					this.closeMenu();
				}
				return;
			}
			if (this.menuKind !== null && this.menuKind !== 'bubble') {
				return;
			}
			const from = selection.from;
			const to = selection.to;
			const items: PopupItem[] = INLINE_ACTIONS.map((action) => ({
				id: action.id,
				label: action.label,
				icon: action.icon,
				onSelect: () => {
					this.closeMenu();
					action.run(view, from, to);
				},
			}));
			if (this.menuKind === 'bubble') {
				this.popup.setItems(items, 'toolbar');
				this.positionMenu(view);
				return;
			}
			this.showMenu(view, 'bubble', items, 'toolbar');
		}

		// ---- block handle ----

		private refreshHandle(view: EditorView): void {
			if (!view.hasFocus) {
				this.hideHandle();
				return;
			}
			const line = view.state.doc.lineAt(view.state.selection.main.head);
			const from = view.coordsAtPos(line.from);
			const to = view.coordsAtPos(line.to);
			if (!from || !to) {
				this.hideHandle();
				return;
			}
			if (!this.handleEl) {
				this.handleEl = this.doc.createEl('button', {
					cls: 'fse-block-handle',
					attr: {
						type: 'button',
						'aria-label': 'Insert block',
						'aria-haspopup': 'true',
					},
				});
				this.handleEl.setText('+');
				this.handleEl.addEventListener('mousedown', (evt) =>
					evt.preventDefault(),
				);
				this.handleEl.addEventListener('click', (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					this.openBlockMenu(view, this.handleLine ?? line.number);
				});
				this.doc.body.appendChild(this.handleEl);
			}
			this.handleLine = line.number;
			this.handleEl.show();
			const center = (from.top + to.bottom) / 2;
			this.handleEl.style.left = `${Math.max(4, from.left - 34)}px`;
			this.handleEl.style.top = `${center - 12}px`;
		}

		private hideHandle(): void {
			this.handleEl?.hide();
		}

		// ---- shared menu helpers ----

		private showMenu(
			view: EditorView,
			kind: MenuKind,
			items: PopupItem[],
			mode: 'list' | 'toolbar' = 'list',
		): void {
			this.menuKind = kind;
			this.popup.setItems(items, mode);
			this.popup.show();
			this.positionMenu(view);
		}

		private positionMenu(view: EditorView): void {
			if (this.menuKind === null) {
				return;
			}
			const position =
				this.menuKind === 'bubble'
					? view.state.selection.main.from
					: this.menuAnchor;
			const coords = view.coordsAtPos(position);
			if (!coords) {
				this.popup.hide();
				return;
			}
			if (this.menuKind === 'bubble') {
				this.popup.positionAt(coords.left, coords.top, true);
			} else {
				this.popup.positionAt(coords.left, coords.bottom + 6);
			}
		}

		private closeMenu(): void {
			this.popup.hide();
			this.menuKind = null;
			this.slashTrigger = null;
			this.blockLine = null;
		}

		private readonly onClickAway = (evt: MouseEvent): void => {
			if (this.menuKind === null) {
				return;
			}
			const target = evt.target as Element | null;
			if (!target || typeof target.closest !== 'function') {
				return;
			}
			if (this.popup.el.contains(target)) {
				return;
			}
			if (this.handleEl && this.handleEl.contains(target)) {
				return;
			}
			this.closeMenu();
		};
	}

	const plugin = ViewPlugin.fromClass(FeishuViewPlugin);

	const feishuKeymap = Prec.high(
		keymap.of([
			{
				key: '/',
				run: (view) => view.plugin(plugin)?.openSlash(view) ?? false,
			},
			{
				key: 'Enter',
				run: (view) => view.plugin(plugin)?.confirmMenu() ?? false,
			},
			{
				key: 'Escape',
				run: (view) => view.plugin(plugin)?.dismissMenu() ?? false,
			},
			{
				key: 'ArrowDown',
				run: (view) => view.plugin(plugin)?.moveMenu(1) ?? false,
			},
			{
				key: 'ArrowUp',
				run: (view) => view.plugin(plugin)?.moveMenu(-1) ?? false,
			},
		]),
	);

	return [plugin, feishuKeymap];
}
