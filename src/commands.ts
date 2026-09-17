import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

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
	build: () => BuiltBlock;
}

export interface InlineAction {
	id: string;
	label: string;
	icon: string;
	run: (view: EditorView, from: number, to: number) => void;
}

export const BLOCK_COMMANDS: BlockCommand[] = [
	{
		id: 'text',
		label: 'Text',
		icon: 'type',
		keywords: ['text', 'paragraph', 'body', 'plain'],
		description: 'Plain paragraph',
		build: () => ({ text: '', cursor: 0 }),
	},
	{
		id: 'heading-1',
		label: 'Heading 1',
		icon: 'heading-1',
		keywords: ['h1', 'heading', 'title'],
		description: 'Large section heading',
		prefix: '# ',
		build: () => ({ text: '# ', cursor: 2 }),
	},
	{
		id: 'heading-2',
		label: 'Heading 2',
		icon: 'heading-2',
		keywords: ['h2', 'heading'],
		description: 'Medium section heading',
		prefix: '## ',
		build: () => ({ text: '## ', cursor: 3 }),
	},
	{
		id: 'heading-3',
		label: 'Heading 3',
		icon: 'heading-3',
		keywords: ['h3', 'heading'],
		description: 'Small section heading',
		prefix: '### ',
		build: () => ({ text: '### ', cursor: 4 }),
	},
	{
		id: 'bullet-list',
		label: 'Bulleted list',
		icon: 'list',
		keywords: ['bullet', 'list', 'ul'],
		description: 'Simple bulleted list',
		prefix: '- ',
		build: () => ({ text: '- ', cursor: 2 }),
	},
	{
		id: 'numbered-list',
		label: 'Numbered list',
		icon: 'list-ordered',
		keywords: ['number', 'list', 'ol'],
		description: 'Ordered numbered list',
		prefix: '1. ',
		build: () => ({ text: '1. ', cursor: 3 }),
	},
	{
		id: 'task-list',
		label: 'Task list',
		icon: 'list-checks',
		keywords: ['task', 'todo', 'checklist'],
		description: 'Checkable to-do list',
		prefix: '- [ ] ',
		build: () => ({ text: '- [ ] ', cursor: 6 }),
	},
	{
		id: 'quote',
		label: 'Quote',
		icon: 'quote',
		keywords: ['quote', 'blockquote'],
		description: 'Quoted block',
		prefix: '> ',
		build: () => ({ text: '> ', cursor: 2 }),
	},
	{
		id: 'callout',
		label: 'Callout',
		icon: 'info',
		keywords: ['callout', 'note', 'info', 'warning', 'tip'],
		description: 'Highlighted callout box',
		prefix: '> [!note] ',
		build: () => ({ text: '> [!note] ', cursor: 10 }),
	},
	{
		id: 'code-block',
		label: 'Code block',
		icon: 'code-2',
		keywords: ['code', 'block', 'fence'],
		description: 'Fenced code block',
		build: () => ({ text: '```\n\n```', cursor: 4 }),
	},
	{
		id: 'math-block',
		label: 'Math block',
		icon: 'sigma',
		keywords: ['math', 'latex', 'formula'],
		description: 'Displayed formula',
		build: () => ({ text: '$$\n\n$$', cursor: 3 }),
	},
	{
		id: 'table',
		label: 'Table',
		icon: 'table',
		keywords: ['table', 'grid'],
		description: '3 × 3 table',
		build: () => ({
			text: '|  |  |  |\n| --- | --- | --- |\n|  |  |  |',
			cursor: 2,
		}),
	},
	{
		id: 'divider',
		label: 'Divider',
		icon: 'minus',
		keywords: ['divider', 'line', 'hr', 'separator'],
		description: 'Horizontal rule',
		standalone: true,
		build: () => ({ text: '---', cursor: 3 }),
	},
];

export const INLINE_ACTIONS: InlineAction[] = [
	{
		id: 'bold',
		label: 'Bold',
		icon: 'bold',
		run: (view, from, to) => toggleInline(view, from, to, '**'),
	},
	{
		id: 'italic',
		label: 'Italic',
		icon: 'italic',
		run: (view, from, to) => toggleInline(view, from, to, '*'),
	},
	{
		id: 'strikethrough',
		label: 'Strikethrough',
		icon: 'strikethrough',
		run: (view, from, to) => toggleInline(view, from, to, '~~'),
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
	marker: string,
): void {
	const doc = view.state.doc;
	const length = marker.length;
	const before = from >= length ? doc.sliceString(from - length, from) : '';
	const after = to + length <= doc.length ? doc.sliceString(to, to + length) : '';

	if (before === marker && after === marker) {
		view.dispatch({
			changes: [
				{ from: from - length, to: from },
				{ from: to, to: to + length },
			],
			selection: EditorSelection.range(from - length, to - length),
		});
	} else {
		view.dispatch({
			changes: [
				{ from, insert: marker },
				{ from: to, insert: marker },
			],
			selection: EditorSelection.range(from + length, to + length),
		});
	}
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
