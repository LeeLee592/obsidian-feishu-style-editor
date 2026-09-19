import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { PopupAccent } from './popup';

/** A block template: the marker line to write plus where to put the caret. */
export interface BuiltBlock {
	text: string;
	cursor: number;
}

export interface BlockCommand {
	id: string;
	label: string;
	icon: string;
	keywords: string[];
	description: string;
	/** Prefix used to detect and replace an existing line of this kind. */
	prefix?: string;
	/** True for the divider, which replaces the line instead of carrying text. */
	standalone?: boolean;
	/** Icon tile colour, matching Feishu's palette per block kind. */
	accent?: PopupAccent;
	/** Keyboard hint surfaced in the menu. */
	shortcut?: string;
	/** True when the entry opens a second level instead of applying directly. */
	hasSubmenu?: boolean;
	/** Marker detected when the caret already sits in this kind of block. */
	detect?: (text: string) => boolean;
	build: () => BuiltBlock;
}

export interface BlockSection {
	title: string;
	commands: BlockCommand[];
	/** Compact icon grid (Feishu's basic palette) or descriptive rows. */
	layout: 'grid' | 'list';
}

export interface InlineAction {
	id: string;
	label: string;
	icon: string;
	shortcut?: string;
	run: (view: EditorView, from: number, to: number) => void;
}

const BLOCK_SECTIONS: BlockSection[] = [
	{
		title: 'Basic',
		layout: 'grid',
		commands: [
			{
				id: 'text',
				label: 'Text',
				icon: 'type',
				accent: 'plain',
				keywords: ['text', 'paragraph', 'body', 'plain'],
				description: 'Plain paragraph',
				build: () => ({ text: '', cursor: 0 }),
			},
			{
				id: 'heading-1',
				label: 'Heading 1',
				icon: 'heading-1',
				accent: 'blue',
				keywords: ['h1', 'heading', 'title'],
				description: 'Large section heading',
				prefix: '# ',
				shortcut: '#',
				build: () => ({ text: '# ', cursor: 2 }),
			},
			{
				id: 'heading-2',
				label: 'Heading 2',
				icon: 'heading-2',
				accent: 'blue',
				keywords: ['h2', 'heading'],
				description: 'Medium section heading',
				prefix: '## ',
				shortcut: '##',
				build: () => ({ text: '## ', cursor: 3 }),
			},
			{
				id: 'heading-3',
				label: 'Heading 3',
				icon: 'heading-3',
				accent: 'blue',
				keywords: ['h3', 'heading'],
				description: 'Small section heading',
				prefix: '### ',
				shortcut: '###',
				build: () => ({ text: '### ', cursor: 4 }),
			},
			{
				id: 'numbered-list',
				label: 'Numbered list',
				icon: 'list-ordered',
				accent: 'purple',
				keywords: ['number', 'list', 'ol', 'ordered'],
				description: 'Ordered list',
				prefix: '1. ',
				build: () => ({ text: '1. ', cursor: 3 }),
			},
			{
				id: 'bullet-list',
				label: 'Bulleted list',
				icon: 'list',
				accent: 'purple',
				keywords: ['bullet', 'list', 'ul'],
				description: 'Bulleted list',
				prefix: '- ',
				shortcut: '-',
				build: () => ({ text: '- ', cursor: 2 }),
			},
			{
				id: 'task-list',
				label: 'Task list',
				icon: 'list-checks',
				accent: 'purple',
				keywords: ['task', 'todo', 'checklist'],
				description: 'Checkable to-do list',
				prefix: '- [ ] ',
				build: () => ({ text: '- [ ] ', cursor: 6 }),
			},
			{
				id: 'quote',
				label: 'Quote',
				icon: 'quote',
				accent: 'plain',
				keywords: ['quote', 'blockquote'],
				description: 'Quoted block',
				prefix: '> ',
				shortcut: '>',
				build: () => ({ text: '> ', cursor: 2 }),
			},
		],
	},
	{
		title: 'Common',
		layout: 'list',
		commands: [
			{
				id: 'callout',
				label: 'Callout',
				icon: 'megaphone',
				accent: 'orange',
				keywords: ['callout', 'note', 'info', 'warning', 'tip', 'admonition'],
				description: 'Highlighted callout box',
				prefix: '> [!note] ',
				hasSubmenu: true,
				build: () => ({ text: '> [!note] ', cursor: 10 }),
			},
			{
				id: 'table',
				label: 'Table',
				icon: 'table',
				accent: 'green',
				keywords: ['table', 'grid', 'sheet'],
				description: '3 × 3 table',
				build: () => ({
					text: '|  |  |  |\n| --- | --- | --- |\n|  |  |  |',
					cursor: 2,
				}),
			},
			{
				id: 'image',
				label: 'Image',
				icon: 'image',
				accent: 'yellow',
				keywords: ['image', 'picture', 'photo', 'media'],
				description: 'Embed an image',
				build: () => ({ text: '![](url)', cursor: 2 }),
			},
			{
				id: 'file',
				label: 'Video or file',
				icon: 'paperclip',
				accent: 'cyan',
				keywords: ['file', 'video', 'attach', 'media', 'embed'],
				description: 'Embed a file or video',
				build: () => ({ text: '![[file]]', cursor: 3 }),
			},
			{
				id: 'math-block',
				label: 'Formula',
				icon: 'sigma',
				accent: 'purple',
				keywords: ['math', 'latex', 'formula', 'tex', 'equation'],
				description: 'Displayed formula',
				build: () => ({ text: '$$\n\n$$', cursor: 3 }),
			},
			{
				id: 'internal-link',
				label: 'Link to note',
				icon: 'link',
				accent: 'blue',
				keywords: ['link', 'wiki', 'reference', 'note'],
				description: 'Link another note',
				build: () => ({ text: '[[]]', cursor: 2 }),
			},
		],
	},
	{
		title: 'Advanced',
		layout: 'list',
		commands: [
			{
				id: 'code-block',
				label: 'Code block',
				icon: 'code-2',
				accent: 'cyan',
				keywords: ['code', 'block', 'fence', 'snippet'],
				description: 'Fenced code block',
				shortcut: '```',
				build: () => ({ text: '```\n\n```', cursor: 4 }),
			},
			{
				id: 'divider',
				label: 'Divider',
				icon: 'minus',
				accent: 'plain',
				keywords: ['divider', 'line', 'hr', 'separator'],
				description: 'Horizontal rule',
				standalone: true,
				shortcut: '---',
				build: () => ({ text: '---', cursor: 3 }),
			},
			{
				id: 'blockquote-with-attribution',
				label: 'Quote with source',
				icon: 'message-square-quote',
				accent: 'plain',
				keywords: ['quote', 'cite', 'source', 'attribution'],
				description: 'Quote and its source',
				build: () => ({
					text: '> quote\n> — author',
					cursor: 2,
				}),
			},
			{
				id: 'toggle',
				label: 'Toggle list',
				icon: 'chevrons-up-down',
				accent: 'plain',
				keywords: ['toggle', 'collapse', 'fold', 'details'],
				description: 'Collapsible block',
				build: () => ({
					text: '- item\n\t- nested item',
					cursor: 2,
				}),
			},
			{
				id: 'frontmatter',
				label: 'Properties',
				icon: 'list-tree',
				accent: 'plain',
				keywords: ['frontmatter', 'properties', 'yaml', 'metadata'],
				description: 'Note properties block',
				build: () => ({
					text: '---\ntags: \n---',
					cursor: 9,
				}),
			},
			{
				id: 'code-inline-note',
				label: 'Term and definition',
				icon: 'book-open',
				accent: 'plain',
				keywords: ['definition', 'glossary', 'term', 'explain'],
				description: 'Term with its meaning',
				build: () => ({
					text: '**term** — definition',
					cursor: 2,
				}),
			},
		],
	},
];

/** Every block command, flattened, for filtering and lookup. */
export const BLOCK_COMMANDS: BlockCommand[] = BLOCK_SECTIONS.flatMap(
	(section) => section.commands,
);

export function blockSections(): BlockSection[] {
	return BLOCK_SECTIONS;
}

/**
 * Callout kinds, offered as the second level of the Callout entry. Obsidian
 * understands these type names natively, so each one renders with its own
 * icon and colour.
 */
export const CALLOUT_KINDS: readonly {
	type: string;
	label: string;
	icon: string;
	accent: PopupAccent;
}[] = [
	{ type: 'note', label: 'Note', icon: 'pencil', accent: 'blue' },
	{ type: 'tip', label: 'Tip', icon: 'flame', accent: 'cyan' },
	{ type: 'info', label: 'Info', icon: 'info', accent: 'blue' },
	{ type: 'success', label: 'Success', icon: 'check-circle-2', accent: 'green' },
	{ type: 'question', label: 'Question', icon: 'help-circle', accent: 'yellow' },
	{ type: 'warning', label: 'Warning', icon: 'alert-triangle', accent: 'orange' },
	{ type: 'danger', label: 'Danger', icon: 'zap', accent: 'red' },
	{ type: 'example', label: 'Example', icon: 'list', accent: 'purple' },
];

export const INLINE_ACTIONS: InlineAction[] = [
	{
		id: 'bold',
		label: 'Bold',
		icon: 'bold',
		shortcut: '⌘B',
		run: (view, from, to) => toggleInline(view, from, to, '**'),
	},
	{
		id: 'italic',
		label: 'Italic',
		icon: 'italic',
		shortcut: '⌘I',
		run: (view, from, to) => toggleInline(view, from, to, '*'),
	},
	{
		id: 'strikethrough',
		label: 'Strikethrough',
		icon: 'strikethrough',
		run: (view, from, to) => toggleInline(view, from, to, '~~'),
	},
	{
		id: 'underline',
		label: 'Underline',
		icon: 'underline',
		run: (view, from, to) => toggleInline(view, from, to, '<u>', '</u>'),
	},
	{
		id: 'code',
		label: 'Inline code',
		icon: 'code',
		run: (view, from, to) => toggleInline(view, from, to, '`'),
	},
	{
		id: 'highlight',
		label: 'Highlight',
		icon: 'highlighter',
		run: (view, from, to) => toggleInline(view, from, to, '=='),
	},
	{
		id: 'link',
		label: 'Link',
		icon: 'link',
		run: applyLink,
	},
];

/** Markers that a "plain text" transform should strip from a line. */
const LINE_PREFIXES: readonly string[] = [
	'- [ ] ',
	'- [x] ',
	'1. ',
	'- ',
	'* ',
	'+ ',
	'> [!note] ',
	'> ',
];

const HEADING_RE = /^#{1,6} /;
const UL_RE = /^[-*+] /;
const OL_RE = /^\d+\. /;
const TASK_RE = /^[-*+] \[[ xX]\] /;
const QUOTE_RE = /^> /;

/** Remove any leading structural marker, returning the bare line content. */
export function stripLinePrefix(text: string): string {
	for (const prefix of LINE_PREFIXES) {
		if (text.startsWith(prefix)) {
			return text.slice(prefix.length);
		}
	}
	return text.replace(HEADING_RE, '');
}

/** True when the line already carries the marker of `command`. */
export function lineHasPrefix(text: string, command: BlockCommand): boolean {
	if (command.id === 'text') {
		return text !== stripLinePrefix(text);
	}
	if (!command.prefix) {
		return false;
	}
	switch (command.id) {
		case 'heading-1':
		case 'heading-2':
		case 'heading-3':
			return text.startsWith(command.prefix);
		case 'bullet-list':
			return UL_RE.test(text) && !TASK_RE.test(text);
		case 'numbered-list':
			return OL_RE.test(text);
		case 'task-list':
			return TASK_RE.test(text);
		case 'quote':
			return QUOTE_RE.test(text);
		default:
			return text.startsWith(command.prefix);
	}
}

/**
 * Marker and caret offset for inserting `command` on an existing line:
 * keeps the line's text and re-uses the typing space when the marker is
 * already there.
 */
export function insertionFor(
	command: BlockCommand,
	lineText: string,
): { prefix: string; cursor: number } {
	const built = command.build();
	if (command.id === 'text' || command.standalone || built.text === '') {
		return { prefix: built.text, cursor: built.cursor };
	}
	// The marker is written without its trailing space, so the line reads
	// "marker + space + content" instead of getting a doubled space.
	const prefix = built.text.endsWith(' ')
		? built.text.slice(0, -1)
		: built.text;
	return { prefix, cursor: prefix.length + 1 };
}

function joinMarker(prefix: string, content: string): string {
	if (content === '') {
		return prefix;
	}
	return prefix === '' ? content : `${prefix} ${content}`;
}

/** Write the marker on an empty line, keeping multi-line templates intact. */
function freshInsert(command: BlockCommand): { text: string; caret: number } {
	const built = command.build();
	if (built.text.includes('\n') || built.text === '') {
		return { text: built.text, caret: built.cursor };
	}
	// A single-line marker keeps its trailing space so the caret can sit
	// where the block's text starts.
	return { text: built.text, caret: built.text.length };
}

function toggleInline(
	view: EditorView,
	from: number,
	to: number,
	open: string,
	close: string = open,
): void {
	const doc = view.state.doc;
	const openLength = open.length;
	const closeLength = close.length;
	const before =
		from >= openLength ? doc.sliceString(from - openLength, from) : '';
	const after =
		to + closeLength <= doc.length ? doc.sliceString(to, to + closeLength) : '';

	if (before === open && after === close) {
		view.dispatch({
			changes: [
				{ from: from - openLength, to: from },
				{ from: to, to: to + closeLength },
			],
			selection: EditorSelection.range(
				from - openLength,
				to - openLength,
			),
		});
		return;
	}
	view.dispatch({
		changes: [
			{ from, insert: open },
			{ from: to, insert: close },
		],
		selection: EditorSelection.range(
			from + openLength,
			to + openLength,
		),
	});
}

function applyLink(view: EditorView, from: number, to: number): void {
	const text = view.state.doc.sliceString(from, to);
	const urlStart = from + text.length + 3;
	view.dispatch({
		changes: { from, to, insert: `[${text}](url)` },
		selection: EditorSelection.range(urlStart, urlStart + 3),
	});
}

/**
 * Insert a block at a line, in the spirit of a block editor: an empty line
 * becomes the block, a line with content is converted in place, and any text
 * selected on that line moves into the new block.
 */
export function applyBlockAtLine(
	view: EditorView,
	lineNumber: number,
	command: BlockCommand,
): void {
	const state = view.state;
	const line = state.doc.line(
		Math.min(Math.max(lineNumber, 1), state.doc.lines),
	);
	applyBlockToLine(view, line, line.text, command);
}

/**
 * Apply a block command to part of a line. `textBeforeTrigger` is the line
 * content without the slash query that triggered the command, so a slash
 * command never depends on a separate deletion transaction.
 */
export function applyBlockAtTrigger(
	view: EditorView,
	trigger: number,
	command: BlockCommand,
): void {
	const line = view.state.doc.lineAt(trigger);
	const offset = trigger - line.from;
	applyBlockToLine(view, line, line.text.slice(0, offset), command);
}

function applyBlockToLine(
	view: EditorView,
	range: { from: number; to: number },
	lineText: string,
	command: BlockCommand,
): void {
	const state = view.state;
	const docLength = state.doc.length;
	// A menu can outlive the document state it was built from; never hand
	// CodeMirror a position it will reject.
	const line = {
		from: Math.min(Math.max(range.from, 0), docLength),
		to: Math.min(Math.max(range.to, 0), docLength),
	};
	const selection = state.selection.main;
	const selectionInside =
		!selection.empty &&
		selection.from >= line.from &&
		selection.to <= line.to &&
		!state.sliceDoc(selection.from, selection.to).includes('\n');
	const selectedText = selectionInside
		? state.sliceDoc(selection.from, selection.to)
		: '';

	if (lineText.trim() === '') {
		const block = freshInsert(command);
		view.dispatch({
			changes: { from: line.from, to: line.to, insert: block.text },
			selection: EditorSelection.cursor(
				Math.min(line.from + block.caret, line.from + block.text.length),
			),
		});
		view.focus();
		return;
	}

	const { prefix, cursor } = insertionFor(command, lineText);
	const content = stripLinePrefix(lineText);
	const finalText = command.id === 'text' ? content : joinMarker(prefix, content);
	const caret = Math.min(
		command.id === 'text' ? 0 : cursor,
		finalText.length,
	);

	if (selectionInside && selectedText !== '') {
		// Keep the line's other text, move only the selected part into the block.
		const before = lineText.slice(0, selection.from - line.from);
		const after = lineText.slice(selection.to - line.from);
		const leadingMarker =
			command.id === 'text' || command.standalone || lineHasPrefix(lineText, command)
				? ''
				: prefix;
		const insert = `${leadingMarker}${before}${selectedText}${after}`;
		const start = line.from + leadingMarker.length + before.length;
		view.dispatch({
			changes: { from: line.from, to: line.to, insert },
			selection: EditorSelection.range(start, start + selectedText.length),
		});
		view.focus();
		return;
	}

	view.dispatch({
		changes: { from: line.from, to: line.to, insert: finalText },
		selection: EditorSelection.cursor(line.from + caret),
	});
	view.focus();
}
