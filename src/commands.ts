import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

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
		id: 'heading-1',
		label: 'Heading 1',
		icon: 'heading-1',
		keywords: ['h1', 'heading', 'title'],
		description: 'Large section heading',
		build: () => ({ text: '# ', cursor: 2 }),
	},
	{
		id: 'heading-2',
		label: 'Heading 2',
		icon: 'heading-2',
		keywords: ['h2', 'heading'],
		description: 'Medium section heading',
		build: () => ({ text: '## ', cursor: 3 }),
	},
	{
		id: 'heading-3',
		label: 'Heading 3',
		icon: 'heading-3',
		keywords: ['h3', 'heading'],
		description: 'Small section heading',
		build: () => ({ text: '### ', cursor: 4 }),
	},
	{
		id: 'bullet-list',
		label: 'Bulleted list',
		icon: 'list',
		keywords: ['bullet', 'list', 'ul'],
		description: 'Simple bulleted list',
		build: () => ({ text: '- ', cursor: 2 }),
	},
	{
		id: 'numbered-list',
		label: 'Numbered list',
		icon: 'list-ordered',
		keywords: ['number', 'list', 'ol'],
		description: 'Ordered numbered list',
		build: () => ({ text: '1. ', cursor: 3 }),
	},
	{
		id: 'task-list',
		label: 'Task list',
		icon: 'list-checks',
		keywords: ['task', 'todo', 'checklist'],
		description: 'Checkable to-do list',
		build: () => ({ text: '- [ ] ', cursor: 6 }),
	},
	{
		id: 'quote',
		label: 'Quote',
		icon: 'quote',
		keywords: ['quote', 'blockquote'],
		description: 'Quoted block',
		build: () => ({ text: '> ', cursor: 2 }),
	},
	{
		id: 'divider',
		label: 'Divider',
		icon: 'minus',
		keywords: ['divider', 'line', 'hr', 'separator'],
		description: 'Horizontal rule',
		build: () => ({ text: '---', cursor: 3 }),
	},
	{
		id: 'code-block',
		label: 'Code block',
		icon: 'code-2',
		keywords: ['code', 'block', 'fence', '```'],
		description: 'Fenced code block',
		build: () => ({ text: '```\n\n```', cursor: 4 }),
	},
	{
		id: 'callout',
		label: 'Callout',
		icon: 'info',
		keywords: ['callout', 'note', 'info', 'warning'],
		description: 'Highlighted callout box',
		build: () => ({ text: '> [!note] ', cursor: 10 }),
	},
	{
		id: 'table',
		label: 'Table',
		icon: 'table',
		keywords: ['table', 'grid'],
		description: 'Basic table',
		build: () => ({ text: '|  |  |  |\n| --- | --- | --- |\n|  |  |  |', cursor: 2 }),
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
