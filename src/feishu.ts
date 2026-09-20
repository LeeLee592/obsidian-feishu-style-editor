import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import {
	EditorView,
	ViewPlugin,
	keymap,
	type PluginValue,
	type ViewUpdate,
} from '@codemirror/view';
import { setIcon } from 'obsidian';
import {
	BLOCK_COMMANDS,
	CALLOUT_KINDS,
	INLINE_ACTIONS,
	activeBlockId,
	applyBlockAtLine,
	applyBlockAtTrigger,
	blockSections,
	calloutCommand,
	commandDescription,
	commandLabel,
	commandMatches,
	sectionTitle,
	type BlockCommand,
} from './commands';
import { pick } from './i18n';
import {
	acquirePopup,
	releasePopup,
	type Popup,
	type PopupItem,
	type PopupOptions,
	type PopupSection,
} from './popup';
import type { FeishuStyleEditorSettings } from './settings';

type MenuKind = 'slash' | 'block' | 'convert' | 'bubble';

/** Trailing text after the slash that still counts as a filter query. */
const SLASH_QUERY_LIMIT = 24;

interface MenuKeyHost {
	readonly instanceId: number;
	handlesDomTarget(target: Node | null): boolean;
	hasOpenMenu(): boolean;
	handlesEditorFocus(): boolean;
	closeAnyMenu(): void;
	handleKey(event: KeyboardEvent): boolean;
}

/**
 * Live view-plugin instances per document. Menu keys are routed through the
 * document instead of CodeMirror's own event plumbing: the editor filters some
 * key events before they reach a view plugin, and an open menu has to own the
 * arrow keys regardless.
 */
const instancesByDocument = new WeakMap<Document, Set<MenuKeyHost>>();

/**
 * Monotonic id per view-plugin instance. Elements this plugin puts in the DOM
 * carry it so a later instance can sweep away relics of one that never got its
 * `destroy()` call (a plugin reload can replace the editor extension without
 * tearing the old view plugins down).
 */
let nextInstanceId = 1;
const liveInstanceIds = new Set<number>();

/** Sends a key to the one editor in this document that has a menu open. */
function routeMenuKey(event: KeyboardEvent): void {
	const set = instancesByDocument.get(event.currentTarget as Document);
	if (!set) {
		return;
	}
	const target = event.target;
	if (!(target instanceof Node)) {
		return;
	}
	for (const instance of set) {
		if (
			instance.handlesDomTarget(target) &&
			instance.hasOpenMenu() &&
			instance.handleKey(event)
		) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
	}
}

function registerMenuKeys(doc: Document, instance: MenuKeyHost): void {
	let set = instancesByDocument.get(doc);
	if (!set) {
		set = new Set();
		instancesByDocument.set(doc, set);
	}
	if (set.size === 0) {
		doc.addEventListener('keydown', routeMenuKey, true);
	}
	set.add(instance);
	liveInstanceIds.add(instance.instanceId);
}

function unregisterMenuKeys(doc: Document, instance: MenuKeyHost): void {
	liveInstanceIds.delete(instance.instanceId);
	const set = instancesByDocument.get(doc);
	if (!set) {
		return;
	}
	set.delete(instance);
	if (set.size === 0) {
		doc.removeEventListener('keydown', routeMenuKey, true);
		instancesByDocument.delete(doc);
	}
}

export function feishuEditorExtension(
	getSettings: () => FeishuStyleEditorSettings,
): Extension {
	class FeishuViewPlugin implements PluginValue, MenuKeyHost {
		readonly instanceId = nextInstanceId++;
		private readonly view: EditorView;
		private readonly doc: Document;
		private readonly popup: Popup;
		private handleEl: HTMLButtonElement | null = null;
		private menuKind: MenuKind | null = null;
		private menuAnchor = 0;
		/** Line a block menu was opened for; the menu dies with that line. */
		private menuLine: number | null = null;
		/** Skips one bubble refresh, so a command's result stays visible. */
		private suppressBubbleOnce = false;
		private slashTrigger: number | null = null;
		private handleLine: number | null = null;
		private visibleLine: number | null = null;

		constructor(view: EditorView) {
			this.view = view;
			// The document is resolved lazily: a view can be constructed while
			// its window is not ready yet, which is what broke this plugin.
			this.doc = view.dom.ownerDocument;
			this.popup = acquirePopup(this.doc);
			this.doc.addEventListener('mousedown', this.onDocMouseDown, true);
			registerMenuKeys(this.doc, this);
			this.doc.defaultView?.addEventListener(
				'scroll',
				this.onViewportChange,
				true,
			);
			this.doc.defaultView?.addEventListener(
				'resize',
				this.onViewportChange,
			);
		}

		/** True when the event happened inside this instance's editor. */
		handlesDomTarget(target: Node | null): boolean {
			return (
				target !== null &&
				(this.view.dom === target || this.view.dom.contains(target))
			);
		}

		hasOpenMenu(): boolean {
			return this.menuKind !== null;
		}

		handlesEditorFocus(): boolean {
			return this.isActiveEditor();
		}

		/** Menu commands are global: only one menu may be open per document. */
		closeAnyMenu(): void {
			if (this.menuKind !== null) {
				this.closeMenu();
			}
		}

		private get settings(): FeishuStyleEditorSettings {
			return getSettings();
		}

		/**
		 * Whether this editor is the one the user is working in. CodeMirror's
		 * own focus flag also drops when the window loses focus, which would
		 * hide the handle and suppress the slash menu for a user who merely
		 * switched windows.
		 */
		private isActiveEditor(): boolean {
			const active = this.doc.activeElement;
			return (
				this.view.hasFocus ||
				(active !== null && this.view.contentDOM.contains(active))
			);
		}

		update(update: ViewUpdate): void {
			if (this.menuKind !== null && !this.isActiveEditor()) {
				this.closeMenu();
			}
			if (this.menuKind === 'slash' && update.docChanged) {
				this.refreshSlashMenu();
			}
			// A block menu belongs to the line it was opened for: once the
			// document is edited or the caret leaves that line, keeping it up
			// would leave a menu that no longer describes the text under it
			// (and it would also block the selection toolbar).
			if (
				(this.menuKind === 'block' || this.menuKind === 'convert') &&
				this.menuLine !== null
			) {
				const line = this.view.state.doc.line(
					Math.min(this.menuLine, this.view.state.doc.lines),
				);
				const head = this.view.state.selection.main.head;
				if (update.docChanged || head < line.from || head > line.to) {
					this.closeMenu();
				}
			}
			if (update.selectionSet || update.docChanged || update.focusChanged) {
				this.scheduleHandle();
				this.scheduleBubble(update);
			}
		}

		destroy(): void {
			this.closeMenu();
			this.handleEl?.remove();
			this.handleEl = null;
			this.doc.removeEventListener('mousedown', this.onDocMouseDown, true);
			unregisterMenuKeys(this.doc, this);
			this.doc.defaultView?.removeEventListener(
				'scroll',
				this.onViewportChange,
				true,
			);
			this.doc.defaultView?.removeEventListener(
				'resize',
				this.onViewportChange,
			);
			releasePopup(this.doc, this.popup);
		}

		// ---- keymap entry points ----

		/** Routes a key to the open menu; false lets the editor handle it. */
		handleKey(event: KeyboardEvent): boolean {
			if (this.menuKind === null) {
				return false;
			}
			switch (event.key) {
				case 'ArrowDown':
					return this.moveMenu(1);
				case 'ArrowUp':
					return this.moveMenu(-1);
				case 'ArrowRight':
					return this.moveMenuWithinRow(1);
				case 'ArrowLeft':
					return this.moveMenuWithinRow(-1);
				case 'Enter':
					return this.confirmMenu();
				case 'Escape':
					return this.dismissMenu();
				case 'Backspace':
					return this.handleMenuBackspace();
				default:
					return false;
			}
		}

		/**
		 * Left/right walk the icon grid of the "+" panel; in a list they stay
		 * with the text caret, which is also what edits a slash query.
		 */
		private moveMenuWithinRow(delta: number): boolean {
			if (this.menuKind !== 'block' || !this.popup.usesIconGrid) {
				return false;
			}
			this.popup.moveSelection(delta);
			return true;
		}

		/** A slash typed at a plausible block position opens the menu. */
		handleSlashInput(text: string): boolean {
			if (!this.settings.slashCommands || text !== '/') {
				return false;
			}
			if (this.menuKind !== null || !this.isActiveEditor()) {
				return false;
			}
			const state = this.view.state;
			if (state.selection.ranges.length !== 1) {
				return false;
			}
			const range = state.selection.main;
			if (!range.empty) {
				return false;
			}
			const head = range.head;
			const line = state.doc.lineAt(head);
			if (!isSlashTriggerPosition(line.text, head - line.from)) {
				return false;
			}
			const next = state.sliceDoc(head, head + 1);
			if (next !== '' && next !== '\n') {
				return false;
			}

			// Insert the slash exactly as the browser would have.
			this.view.dispatch({
				changes: { from: head, insert: '/' },
				selection: EditorSelection.cursor(head + 1),
			});
			this.slashTrigger = head;
			this.menuKind = 'slash';
			this.menuAnchor = head + 1;
			this.refreshSlashMenu();
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
			if (this.menuKind === 'slash') {
				this.retractSlash();
			}
			this.closeMenu();
			return true;
		}

		moveMenu(delta: number): boolean {
			if (this.menuKind === null || this.menuKind === 'bubble') {
				return false;
			}
			this.popup.moveSelection(delta);
			return true;
		}

		/** Delete/Backspace on the trigger slash closes the menu with it. */
		handleMenuBackspace(): boolean {
			if (this.menuKind !== 'slash') {
				return false;
			}
			const trigger = this.validSlashTrigger();
			if (trigger === null) {
				return false;
			}
			const head = this.view.state.selection.main.head;
			if (head - 1 !== trigger) {
				return false;
			}
			this.retractSlash();
			this.closeMenu();
			return true;
		}

		/**
		 * The trigger slash is still where we left it, i.e. the menu still
		 * describes the text under the caret.
		 */
		private validSlashTrigger(): number | null {
			const trigger = this.slashTrigger;
			if (trigger === null || this.menuKind !== 'slash') {
				return null;
			}
			const state = this.view.state;
			if (trigger < 0 || trigger >= state.doc.length) {
				return null;
			}
			return state.sliceDoc(trigger, trigger + 1) === '/' ? trigger : null;
		}

		// ---- slash menu ----

		private retractSlash(): void {
			const trigger = this.validSlashTrigger();
			if (trigger === null) {
				return;
			}
			this.view.dispatch({
				changes: { from: trigger, to: trigger + 1 },
				selection: EditorSelection.cursor(trigger),
			});
		}

		private refreshSlashMenu(): void {
			const trigger = this.validSlashTrigger();
			if (trigger === null) {
				this.closeMenu();
				return;
			}
			const state = this.view.state;
			const selection = state.selection.main;
			if (!selection.empty || selection.head <= trigger) {
				this.closeMenu();
				return;
			}
			const query = state.sliceDoc(trigger + 1, selection.head);
			if (query.length > SLASH_QUERY_LIMIT || query.includes('\n')) {
				this.closeMenu();
				return;
			}
			this.menuAnchor = selection.head;
			const sections = this.buildSlashSections(trigger, query);
			const total = sections.reduce((n, s) => n + s.items.length, 0);
			if (total === 0) {
				this.closeMenu();
				return;
			}
			this.showMenu('slash', sections, 'list', {
				// Feishu's slash menu opens with the keyword field reading
				// "/输入关键词"; the "+" panel has no field and leads with an
				// icon grid instead, which is what tells the two apart.
				search: {
					value: `/${query}`,
					hint:
						query === ''
							? pick('Type a keyword', '输入关键词')
							: undefined,
				},
				ariaLabel: pick('Block menu', '块菜单'),
			});
		}

		private buildSlashSections(
			trigger: number,
			query: string,
		): PopupSection[] {
			const q = query.trim().toLowerCase();
			// The line the slash was typed on decides which entry is the one
			// the caret is already in.
			const current = activeBlockId(
				this.view.state.doc.lineAt(trigger).text,
			);
			// While filtering, drop the headings and show one flat list, the way
			// a search result reads better than a half-empty outline.
			if (q !== '') {
				const matches = BLOCK_COMMANDS.filter((command) =>
					commandMatches(command, q),
				).map((command) => this.buildSlashItem(trigger, command, current));
				return matches.length === 0 ? [] : [{ items: matches }];
			}
			return this.typeSections((command) =>
				this.buildSlashItem(trigger, command, current),
			);
		}

		/**
		 * Labelled block list, shared by the slash menu and the selection
		 * toolbar's "Turn into" entry: every block, grouped and named.
		 */
		private typeSections(
			buildItem: (command: BlockCommand) => PopupItem,
		): PopupSection[] {
			return blockSections().map((section) => ({
				title: sectionTitle(section),
				layout: 'list',
				items: section.commands.map((command) => buildItem(command)),
			}));
		}

		private buildSlashItem(
			trigger: number,
			command: BlockCommand,
			current: string,
		): PopupItem {
			return {
				id: command.id,
				label: commandLabel(command),
				icon: command.icon,
				description: commandDescription(command),
				shortcut: command.shortcut,
				accent: command.accent,
				active: command.id === current,
				onSelect: () => {
					// Re-read the trigger: the menu may have been rebuilt after
					// the document changed underneath it.
					const current = this.validSlashTrigger();
					this.closeMenu();
					this.suppressBubbleOnce = true;
					applyBlockAtTrigger(this.view, current ?? trigger, command);
				},
			};
		}

		/**
		 * Places the UI after the current transaction, using CodeMirror's
		 * measure cycle when it runs and a plain timeout when it does not.
		 * A background window never gets an animation frame, so a
		 * measure-only path would leave the editor without a handle or menu
		 * until it is focused again.
		 */
		private schedulePlacement(place: () => void): void {
			let done = false;
			const run = (): void => {
				if (done) {
					return;
				}
				done = true;
				try {
					place();
				} catch {
					// A stale position must never break the editor.
				}
			};
			this.view.requestMeasure({ read: run });
			this.doc.defaultView?.setTimeout(run, 0);
		}

		/**
		 * Runs the placement only once the popup has a layout box. Positioning a
		 * freshly built menu reads a zero height, which is how the selection
		 * toolbar used to end up far above the text.
		 */
		private schedulePlacementWhenMeasured(place: () => void): void {
			const win = this.doc.defaultView;
			let attempts = 0;
			const tick = (): void => {
				const height = this.popup.el.getBoundingClientRect().height;
				if (height > 0 || attempts >= 3) {
					this.schedulePlacement(place);
					return;
				}
				attempts += 1;
				win?.requestAnimationFrame(tick);
			};
			tick();
		}

		// ---- block handle ----

		private scheduleHandle(): void {
			this.visibleLine = this.view.state.doc.lineAt(
				this.view.state.selection.main.head,
			).number;
			this.schedulePlacement(() => this.placeHandle());
		}

		private placeHandle(): void {
			if (!this.settings.blockHandle || !this.isActiveEditor()) {
				this.hideHandle();
				return;
			}
			const lineNumber = this.visibleLine;
			if (lineNumber === null || lineNumber > this.view.state.doc.lines) {
				this.hideHandle();
				return;
			}
			const line = this.view.state.doc.line(lineNumber);
			const coords = this.coordsAt(line.from);
			if (!coords) {
				this.hideHandle();
				return;
			}
			this.takeOverUi();
			const handle = this.ensureHandle();
			this.handleLine = lineNumber;
			handle.show();
			const lineHeight = Math.max(coords.bottom - coords.top, 20);
			handle.style.left = `${Math.max(4, coords.left - 36)}px`;
			handle.style.top = `${coords.top + (lineHeight - 26) / 2}px`;
		}

		private ensureHandle(): HTMLButtonElement {
			if (this.handleEl) {
				return this.handleEl;
			}
			const handle = this.doc.body.createEl('button', {
				cls: 'fse-block-handle',
				attr: {
					type: 'button',
					'aria-label': pick('Add block', '添加块'),
					title: pick('Add block', '添加块'),
					'aria-haspopup': 'true',
					'data-fse-owner': String(this.instanceId),
				},
			});
			setIcon(handle, 'plus');
			handle.addEventListener('mousedown', (evt) => evt.preventDefault());
			handle.addEventListener('click', (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				const lineNumber =
					this.handleLine ??
					this.view.state.doc.lineAt(this.view.state.selection.main.head)
						.number;
				this.openBlockMenu(lineNumber);
			});
			this.handleEl = handle;
			return handle;
		}

		private hideHandle(): void {
			this.handleEl?.hide();
		}

		/**
		 * One editor owns the plugin UI at a time. Several editor views can be
		 * alive for the same document, and the instance that does not hold the
		 * caret would otherwise draw a duplicate menu or handle.
		 */
		private takeOverUi(): void {
			const set = instancesByDocument.get(this.doc);
			if (set) {
				for (const other of set) {
					if (other !== this) {
						other.closeAnyMenu();
					}
				}
			}
			this.sweepHandles();
		}

		/**
		 * One editor owns the plugin UI at a time, so any handle that is not
		 * this instance's is either hidden (another live editor, which will
		 * show its own again when it takes over) or dropped (an instance that
		 * never got its `destroy()`, e.g. a plugin reload).
		 */
		private sweepHandles(): void {
			const handles = this.doc.body.querySelectorAll<HTMLElement>(
				'.fse-block-handle',
			);
			for (const el of Array.from(handles)) {
				if (el === this.handleEl) {
					continue;
				}
				const owner = Number(el.getAttribute('data-fse-owner'));
				if (liveInstanceIds.has(owner)) {
					el.hide();
				} else {
					el.remove();
				}
			}
		}

		// ---- bubble toolbar ----

		private scheduleBubble(update: ViewUpdate): void {
			if (this.suppressBubbleOnce) {
				// A block command just rewrote the line: showing the toolbar on
				// top of the result would hide what the user asked for.
				this.suppressBubbleOnce = false;
				return;
			}
			if (!this.settings.bubbleToolbar) {
				if (this.menuKind === 'bubble') {
					this.closeMenu();
				}
				return;
			}
			if (update.focusChanged && !this.isActiveEditor()) {
				if (this.menuKind === 'bubble') {
					this.closeMenu();
				}
				return;
			}
			this.refreshBubble();
		}

		private refreshBubble(): void {
			const selection = this.view.state.selection.main;
			if (selection.empty || this.view.state.selection.ranges.length !== 1) {
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
			// Feishu's toolbar is segmented: a block converter, then the inline
			// marks, then the block-level marks.
			const asItem = (action: (typeof INLINE_ACTIONS)[number]): PopupItem => ({
				id: action.id,
				label: pick(action.label, action.labelZh),
				icon: action.icon,
				shortcut: action.shortcut,
				onSelect: () => {
					this.closeMenu();
					action.run(this.view, from, to);
				},
			});
			const inlineIds = new Set(
				['bold', 'italic', 'underline', 'strikethrough'],
			);
			const sections: PopupSection[] = [
				{
					items: [
						{
							id: 'convert-block',
							label: pick('Turn into', '转换为'),
							icon: 'text-cursor-input',
							hasSubmenu: true,
							onSelect: () => {
								this.openConvertMenu(
									this.view.state.doc.lineAt(selection.from).number,
								);
							},
						},
					],
				},
				{
					divider: true,
					items: INLINE_ACTIONS.filter((a) => inlineIds.has(a.id)).map(
						asItem,
					),
				},
				{
					divider: true,
					items: INLINE_ACTIONS.filter((a) => !inlineIds.has(a.id)).map(
						asItem,
					),
				},
			];
			if (this.menuKind === 'bubble') {
				this.popup.setContent(sections, 'toolbar', this.popupOptions());
				this.popup.show();
				this.schedulePlacementWhenMeasured(() => this.placeMenu());
				return;
			}
			this.showMenu('bubble', sections, 'toolbar');
		}

		// ---- shared menu helpers ----

		private buildBlockItem(
			command: BlockCommand,
			lineNumber: number,
			current: string,
		): PopupItem {
			return {
				id: command.id,
				label: commandLabel(command),
				icon: command.icon,
				description: commandDescription(command),
				shortcut: command.shortcut,
				hasSubmenu: command.hasSubmenu,
				accent: command.accent,
				active: command.id === current,
				onSelect: () => {
					if (command.id === 'callout') {
						this.openCalloutMenu(lineNumber);
						return;
					}
					this.closeMenu();
					this.suppressBubbleOnce = true;
					applyBlockAtLine(this.view, lineNumber, command);
				},
			};
		}

		/** Second level for Callout, the way Feishu nests block variants. */
		private openCalloutMenu(lineNumber: number): void {
			const line = this.view.state.doc.line(
				Math.min(Math.max(lineNumber, 1), this.view.state.doc.lines),
			);
			const items: PopupItem[] = CALLOUT_KINDS.map((kind) => ({
				id: `callout-${kind.type}`,
				label: pick(kind.label, kind.labelZh),
				icon: kind.icon,
				accent: kind.accent,
				onSelect: () => {
					this.closeMenu();
					this.suppressBubbleOnce = true;
					applyBlockAtLine(
						this.view,
						line.from,
						calloutCommand(kind.type),
					);
				},
			}));
			this.menuAnchor = line.from;
			this.menuLine = line.number;
			this.showMenu('block', [{ items }], 'list', {
				ariaLabel: pick('Callout type', '提示块类型'),
			});
		}

		/**
		 * The "+" panel: Feishu's insert palette. The basic blocks come as an
		 * icon-only grid, the rest as labelled rows with their own colours.
		 */
		private openBlockMenu(lineNumber: number): void {
			const anchorLine = this.view.state.doc.line(
				Math.min(Math.max(lineNumber, 1), this.view.state.doc.lines),
			);
			const current = activeBlockId(anchorLine.text);
			const sections: PopupSection[] = blockSections().map((section) => ({
				title: sectionTitle(section),
				layout: section.layout,
				items: section.commands
					.filter(
						(command) =>
							section.layout !== 'icons' || command.tile === true,
					)
					.map((command) =>
						this.buildBlockItem(command, lineNumber, current),
					),
			}));
			this.menuAnchor = anchorLine.from;
			this.menuLine = anchorLine.number;
			this.showMenu('block', sections, 'list', {
				ariaLabel: pick('Insert block', '插入块'),
			});
		}

		/**
		 * What the selection toolbar's "Turn into" opens: the same block list
		 * the slash menu shows, minus the keyword field.
		 */
		private openConvertMenu(lineNumber: number): void {
			const anchorLine = this.view.state.doc.line(
				Math.min(Math.max(lineNumber, 1), this.view.state.doc.lines),
			);
			const current = activeBlockId(anchorLine.text);
			this.menuAnchor = anchorLine.from;
			this.menuLine = anchorLine.number;
			this.showMenu(
				'convert',
				this.typeSections((command) =>
					this.buildBlockItem(command, anchorLine.number, current),
				),
				'list',
				{ ariaLabel: pick('Turn into', '转换为') },
			);
		}

		private showMenu(
			kind: MenuKind,
			sections: PopupSection[],
			mode: 'list' | 'toolbar' = 'list',
			options: PopupOptions = {},
		): void {
			this.takeOverUi();
			this.menuKind = kind;
			this.popup.setContent(sections, mode, this.popupOptions(options));
			// Reveal before measuring: a hidden element reports a zero height,
			// which would misplace a menu that has to fit above its anchor.
			this.popup.show();
			// The anchor may sit in a part of the document that has not been
			// laid out yet (the character just typed, a fresh selection), so
			// coordinates are read on a measure pass with fallbacks.
			this.schedulePlacementWhenMeasured(() => this.placeMenu());
		}

		/**
		 * Options the shared popup needs: the icon palette from the user's
		 * settings, plus whatever the menu kind adds on top.
		 */
		private popupOptions(extra: PopupOptions = {}): PopupOptions {
			return { coloredIcons: this.settings.coloredIcons, ...extra };
		}

		/** Places the open menu once layout can be read. */
		private placeMenu(): void {
			const kind = this.menuKind;
			if (kind === null) {
				return;
			}
			const coords = this.anchorCoords();
			if (!coords) {
				return;
			}
			if (kind === 'bubble') {
				// A slightly wider gap than the list menu: headings in Obsidian
				// carry a negative bottom margin, so the line box starts above
				// the text and a tight gap reads as an overlap.
				this.popup.positionAt(coords.left, coords.top, true, 14);
			} else {
				this.popup.positionAt(coords.left, coords.bottom + 6);
			}
		}


		/** `coordsAtPos` throws on a position the view has not seen yet. */
		private coordsAt(pos: number): {
			left: number;
			top: number;
			bottom: number;
		} | null {
			try {
				return this.view.coordsAtPos(pos);
			} catch {
				return null;
			}
		}

		/** Coordinates for the menu anchor, degrading gracefully. */
		private anchorCoords(): { left: number; top: number; bottom: number } | null {
			const state = this.view.state;
			const selection = state.selection.main;
			// A selection toolbar follows the caret; a list menu follows the
			// position it was opened at.
			const candidates =
				this.menuKind === 'bubble'
					? [selection.from, selection.head, this.menuAnchor]
					: [
							this.menuAnchor,
							selection.from,
							selection.head,
							state.doc.lineAt(
								Math.min(this.menuAnchor, state.doc.length),
							).from,
						];
			for (const pos of candidates) {
				const coords = this.coordsAt(
					Math.min(Math.max(pos, 0), state.doc.length),
				);
				if (coords) {
					return coords;
				}
			}
			// Last resort: the visible part of the editor.
			const rect = this.view.dom.getBoundingClientRect();
			return rect.width > 0
				? { left: rect.left + 24, top: rect.top + 24, bottom: rect.top + 48 }
				: null;
		}

		private closeMenu(): void {
			this.popup.hide();
			this.menuKind = null;
			this.slashTrigger = null;
			this.menuLine = null;
		}

		// ---- global listeners ----

		private readonly onDocMouseDown = (evt: MouseEvent): void => {
			if (this.menuKind === null) {
				return;
			}
			const target = evt.target;
			if (!(target instanceof Element)) {
				return;
			}
			if (this.popup.el.contains(target)) {
				return;
			}
			if (this.handleEl && this.handleEl.contains(target)) {
				return;
			}
			if (this.view.dom.contains(target)) {
				return;
			}
			this.closeMenu();
		};

		private readonly onViewportChange = (): void => {
			if (this.menuKind !== null) {
				this.schedulePlacement(() => this.placeMenu());
			}
			if (this.settings.blockHandle) {
				this.schedulePlacement(() => this.placeHandle());
			}
		};
	}

	/**
	 * Keys that drive an open menu are taken here rather than in a keymap: a
	 * view plugin's DOM handlers run before every keymap, including the ones
	 * Obsidian installs at a higher precedence than this extension. Enter and
	 * Escape stay in the keymap as well so the menu still works when the event
	 * never reaches the view plugin.
	 */
	function handlePluginKey(event: KeyboardEvent, view: EditorView): boolean {
		return view.plugin(plugin)?.handleKey(event) ?? false;
	}

	const plugin = ViewPlugin.fromClass(FeishuViewPlugin, {
		eventHandlers: { keydown: handlePluginKey },
	});

	const feishuKeymap = Prec.high(
		keymap.of([
			{
				key: 'Enter',
				run: (view) => view.plugin(plugin)?.confirmMenu() ?? false,
			},
			{
				key: 'Escape',
				run: (view) => view.plugin(plugin)?.dismissMenu() ?? false,
			},
		]),
	);

	// Typing is observed through the input handler rather than a key binding:
	// a `/` key binding would swallow the character in every other context.
	const feishuInput = EditorView.inputHandler.of((view, from, to, text) => {
		if (from !== to) {
			return false;
		}
		return view.plugin(plugin)?.handleSlashInput(text) ?? false;
	});

	return [plugin, feishuKeymap, feishuInput];
}

/**
 * A slash opens the block menu at the start of a line or after whitespace,
 * so paths, URLs and `and/or` stay untouched.
 */
function isSlashTriggerPosition(lineText: string, offset: number): boolean {
	if (offset === 0) {
		return true;
	}
	const before = lineText.slice(0, offset);
	if (!/\s$/.test(before)) {
		return false;
	}
	// Only the first block marker of a line may hold a slash menu.
	return !/^\s*[-*+>]/.test(before) || /^\s*[-*+>]\s*$/.test(before);
}
