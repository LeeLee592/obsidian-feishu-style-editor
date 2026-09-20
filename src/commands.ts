import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { pick } from './i18n';
import type { PopupAccent } from './popup';

/** A block template: the marker line to write plus where to put the caret. */
export interface BuiltBlock {
	text: string;
	cursor: number;
}

export interface BlockCommand {
	id: string;
	/** English label, the primary search key. */
	label: string;
	/** Label for a Chinese interface, matched by search as well. */
	labelZh: string;
	icon: string;
	/** Search terms in both languages. */
	keywords: string[];
	description: string;
	descriptionZh: string;
	/** Prefix used to detect and replace an existing line of this kind. */
	prefix?: string;
	/** True for the divider, which replaces the line instead of carrying text. */
	standalone?: boolean;
	/** Icon colour, matching Feishu's palette per block kind. */
	accent?: PopupAccent;
	/** Keyboard hint surfaced in the menu. */
	shortcut?: string;
	/** True when the entry opens a second level instead of applying directly. */
	hasSubmenu?: boolean;
	/**
	 * Shown as an icon-only tile in the "+" panel's basic grid, the way
	 * Feishu packs H1/H2/H3, the lists and the inline blocks into two rows.
	 */
	tile?: boolean;
	/** Marker detected when the caret already sits in this kind of block. */
	detect?: (text: string) => boolean;
	build: () => BuiltBlock;
}

export interface BlockSection {
	id: 'basic' | 'common';
	title: string;
	titleZh: string;
	/**
	 * `icons` is the icon-only grid of the "+" panel; the slash menu always
	 * renders a labelled list, whichever section it comes from.
	 */
	layout: 'icons' | 'list';
	commands: BlockCommand[];
}

export interface InlineAction {
	id: string;
	label: string;
	labelZh: string;
	icon: string;
	shortcut?: string;
	run: (view: EditorView, from: number, to: number) => void;
}

/** Label of a block command in the language Obsidian runs in. */
export function commandLabel(command: BlockCommand): string {
	return pick(command.label, command.labelZh);
}

/** Description of a block command in the language Obsidian runs in. */
export function commandDescription(command: BlockCommand): string {
	return pick(command.description, command.descriptionZh);
}

/** Section heading in the language Obsidian runs in. */
export function sectionTitle(section: BlockSection): string {
	return pick(section.title, section.titleZh);
}

/**
 * Feishu splits its block panel in two: a compact palette of the everyday
 * blocks, then descriptive rows for the blocks that carry media or structure.
 * Colours follow Feishu's own icons — blue for text and lists, green for code
 * and tables, orange for the divider and highlight blocks, purple for maths.
 */

/**
 * The Callout entry, without its template: the second level of the menu
 * re-points the same command at one of Obsidian's callout types.
 */
const CALLOUT_BASE = {
	id: 'callout',
	label: 'Callout',
	labelZh: '高亮块',
	icon: 'megaphone',
	accent: 'orange' as PopupAccent,
	keywords: [
		'callout',
		'note',
		'info',
		'warning',
		'tip',
		'admonition',
		'高亮块',
		'提示块',
		'标注',
	],
	description: 'Highlighted callout box',
	descriptionZh: '高亮提示块',
	prefix: '> [!note] ',
	hasSubmenu: true,
	// A callout is any `> [!type]` marker, not just the note default.
	detect: (text: string) => CALLOUT_RE.test(text),
};

const BLOCK_SECTIONS: BlockSection[] = [
	{
		id: 'basic',
		title: 'Basic',
		titleZh: '基础',
		layout: 'icons',
		commands: [
			{
				id: 'text',
				label: 'Text',
				labelZh: '文本',
				icon: 'type',
				accent: 'blue',
				keywords: ['text', 'paragraph', 'body', 'plain', '文本', '正文', '段落'],
				description: 'Plain paragraph',
				descriptionZh: '普通正文段落',
				tile: true,
				build: () => ({ text: '', cursor: 0 }),
			},
			{
				id: 'heading-1',
				label: 'Heading 1',
				labelZh: '一级标题',
				icon: 'heading-1',
				accent: 'blue',
				keywords: ['h1', 'heading', 'title', '标题', '一级标题'],
				description: 'Large section heading',
				descriptionZh: '大号章节标题',
				prefix: '# ',
				shortcut: '#',
				tile: true,
				build: () => ({ text: '# ', cursor: 2 }),
			},
			{
				id: 'heading-2',
				label: 'Heading 2',
				labelZh: '二级标题',
				icon: 'heading-2',
				accent: 'blue',
				keywords: ['h2', 'heading', '标题', '二级标题'],
				description: 'Medium section heading',
				descriptionZh: '中号章节标题',
				prefix: '## ',
				shortcut: '##',
				tile: true,
				build: () => ({ text: '## ', cursor: 3 }),
			},
			{
				id: 'heading-3',
				label: 'Heading 3',
				labelZh: '三级标题',
				icon: 'heading-3',
				accent: 'blue',
				keywords: ['h3', 'heading', '标题', '三级标题'],
				description: 'Small section heading',
				descriptionZh: '小号章节标题',
				prefix: '### ',
				shortcut: '###',
				tile: true,
				build: () => ({ text: '### ', cursor: 4 }),
			},
			{
				id: 'numbered-list',
				label: 'Numbered list',
				labelZh: '有序列表',
				icon: 'list-ordered',
				accent: 'blue',
				keywords: [
					'number',
					'list',
					'ol',
					'ordered',
					'有序列表',
					'编号',
					'列表',
				],
				description: 'Ordered list',
				descriptionZh: '带序号的列表',
				prefix: '1. ',
				tile: true,
				build: () => ({ text: '1. ', cursor: 3 }),
			},
			{
				id: 'bullet-list',
				label: 'Bulleted list',
				labelZh: '无序列表',
				icon: 'list',
				accent: 'blue',
				keywords: ['bullet', 'list', 'ul', '无序列表', '项目符号', '列表'],
				description: 'Bulleted list',
				descriptionZh: '带项目符号的列表',
				prefix: '- ',
				shortcut: '-',
				tile: true,
				build: () => ({ text: '- ', cursor: 2 }),
			},
			{
				id: 'task-list',
				label: 'Task list',
				labelZh: '任务列表',
				icon: 'list-checks',
				accent: 'blue',
				keywords: ['task', 'todo', 'checklist', '任务', '待办', '清单'],
				description: 'Checkable to-do list',
				descriptionZh: '可勾选的待办清单',
				prefix: '- [ ] ',
				tile: true,
				build: () => ({ text: '- [ ] ', cursor: 6 }),
			},
			{
				id: 'code-block',
				label: 'Code block',
				labelZh: '代码块',
				icon: 'braces',
				accent: 'green',
				keywords: ['code', 'block', 'fence', 'snippet', '代码', '代码块'],
				description: 'Fenced code block',
				descriptionZh: '围栏代码块',
				shortcut: '```',
				tile: true,
				build: () => ({ text: '```\n\n```', cursor: 4 }),
			},
			{
				id: 'quote',
				label: 'Quote',
				labelZh: '引用',
				icon: 'quote',
				accent: 'blue',
				keywords: ['quote', 'blockquote', '引用', '引述'],
				description: 'Quoted block',
				descriptionZh: '引用段落',
				prefix: '> ',
				shortcut: '>',
				tile: true,
				build: () => ({ text: '> ', cursor: 2 }),
			},
			{
				id: 'divider',
				label: 'Divider',
				labelZh: '分隔线',
				icon: 'minus',
				accent: 'orange',
				keywords: ['divider', 'line', 'hr', 'separator', '分隔线', '分割线'],
				description: 'Horizontal rule',
				descriptionZh: '水平分隔线',
				standalone: true,
				shortcut: '---',
				tile: true,
				build: () => ({ text: '---', cursor: 3 }),
			},
			{
				id: 'internal-link',
				label: 'Link to note',
				labelZh: '链接到笔记',
				icon: 'link',
				accent: 'blue',
				keywords: [
					'link',
					'wiki',
					'reference',
					'note',
					'链接',
					'双链',
					'引用笔记',
				],
				description: 'Link another note',
				descriptionZh: '链接到另一篇笔记',
				tile: true,
				build: () => ({ text: '[[]]', cursor: 2 }),
			},
			{
				id: 'toggle',
				label: 'Toggle list',
				labelZh: '折叠列表',
				icon: 'chevrons-up-down',
				accent: 'blue',
				keywords: ['toggle', 'collapse', 'fold', 'details', '折叠', '收起'],
				description: 'Collapsible block',
				descriptionZh: '可折叠的列表块',
				tile: true,
				build: () => ({
					text: '- item\n\t- nested item',
					cursor: 2,
				}),
			},
		],
	},
	{
		id: 'common',
		title: 'Common',
		titleZh: '常用',
		layout: 'list',
		commands: [
			{
				id: 'image',
				label: 'Image',
				labelZh: '图片',
				icon: 'image',
				accent: 'yellow',
				keywords: ['image', 'picture', 'photo', 'media', '图片', '图像'],
				description: 'Embed an image',
				descriptionZh: '插入一张图片',
				build: () => ({ text: '![](url)', cursor: 2 }),
			},
			{
				id: 'file',
				label: 'Video or file',
				labelZh: '视频或文件',
				icon: 'paperclip',
				accent: 'blue',
				keywords: [
					'file',
					'video',
					'attach',
					'media',
					'embed',
					'文件',
					'视频',
					'附件',
				],
				description: 'Embed a file or video',
				descriptionZh: '插入视频或文件',
				build: () => ({ text: '![[file]]', cursor: 3 }),
			},
			{
				id: 'table',
				label: 'Table',
				labelZh: '表格',
				icon: 'table',
				accent: 'green',
				keywords: ['table', 'grid', 'sheet', '表格'],
				description: '3 × 3 table',
				descriptionZh: '3 × 3 表格',
				build: () => ({
					text: '|  |  |  |\n| --- | --- | --- |\n|  |  |  |',
					cursor: 2,
				}),
			},
			{
				...CALLOUT_BASE,
				build: () => ({ text: '> [!note] ', cursor: 10 }),
			},
			{
				id: 'blockquote-with-attribution',
				label: 'Quote with source',
				labelZh: '带出处的引用',
				icon: 'message-square-quote',
				accent: 'blue',
				keywords: [
					'quote',
					'cite',
					'source',
					'attribution',
					'引用',
					'出处',
				],
				description: 'Quote and its source',
				descriptionZh: '引用并标注出处',
				build: () => ({
					text: '> quote\n> — author',
					cursor: 2,
				}),
			},
			{
				id: 'math-block',
				label: 'Formula',
				labelZh: '公式',
				icon: 'sigma',
				accent: 'purple',
				keywords: [
					'math',
					'latex',
					'formula',
					'tex',
					'equation',
					'公式',
					'数学',
				],
				description: 'Displayed formula',
				descriptionZh: '块级公式',
				build: () => ({ text: '$$\n\n$$', cursor: 3 }),
			},
			{
				id: 'frontmatter',
				label: 'Properties',
				labelZh: '属性',
				icon: 'list-tree',
				accent: 'cyan',
				keywords: [
					'frontmatter',
					'properties',
					'yaml',
					'metadata',
					'属性',
					'元数据',
				],
				description: 'Note properties block',
				descriptionZh: '笔记属性块',
				build: () => ({
					text: '---\ntags: \n---',
					cursor: 9,
				}),
			},
			{
				id: 'code-inline-note',
				label: 'Term and definition',
				labelZh: '术语与释义',
				icon: 'book-open',
				accent: 'purple',
				keywords: [
					'definition',
					'glossary',
					'term',
					'explain',
					'术语',
					'定义',
					'释义',
				],
				description: 'Term with its meaning',
				descriptionZh: '术语加解释',
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

/** The Callout entry, re-pointed at one of Obsidian's callout types. */
export function calloutCommand(type: string): BlockCommand {
	return {
		...CALLOUT_BASE,
		build: () => ({ text: `> [!${type}] `, cursor: type.length + 5 }),
	};
}

/**
 * Callout kinds, offered as the second level of the Callout entry. Obsidian
 * understands these type names natively, so each one renders with its own
 * icon and colour.
 */
export const CALLOUT_KINDS: readonly {
	type: string;
	label: string;
	labelZh: string;
	icon: string;
	accent: PopupAccent;
}[] = [
	{ type: 'note', label: 'Note', labelZh: '备注', icon: 'pencil', accent: 'blue' },
	{ type: 'tip', label: 'Tip', labelZh: '提示', icon: 'flame', accent: 'cyan' },
	{ type: 'info', label: 'Info', labelZh: '信息', icon: 'info', accent: 'blue' },
	{
		type: 'success',
		label: 'Success',
		labelZh: '成功',
		icon: 'check-circle-2',
		accent: 'green',
	},
	{
		type: 'question',
		label: 'Question',
		labelZh: '问题',
		icon: 'help-circle',
		accent: 'yellow',
	},
	{
		type: 'warning',
		label: 'Warning',
		labelZh: '警告',
		icon: 'alert-triangle',
		accent: 'orange',
	},
	{ type: 'danger', label: 'Danger', labelZh: '危险', icon: 'zap', accent: 'red' },
	{
		type: 'example',
		label: 'Example',
		labelZh: '示例',
		icon: 'list',
		accent: 'purple',
	},
];

export const INLINE_ACTIONS: InlineAction[] = [
	{
		id: 'bold',
		label: 'Bold',
		labelZh: '加粗',
		icon: 'bold',
		shortcut: '⌘B',
		run: (view, from, to) => toggleInline(view, from, to, '**'),
	},
	{
		id: 'italic',
		label: 'Italic',
		labelZh: '斜体',
		icon: 'italic',
		shortcut: '⌘I',
		run: (view, from, to) => toggleInline(view, from, to, '*'),
	},
	{
		id: 'strikethrough',
		label: 'Strikethrough',
		labelZh: '删除线',
		icon: 'strikethrough',
		run: (view, from, to) => toggleInline(view, from, to, '~~'),
	},
	{
		id: 'underline',
		label: 'Underline',
		labelZh: '下划线',
		icon: 'underline',
		run: (view, from, to) => toggleInline(view, from, to, '<u>', '</u>'),
	},
	{
		id: 'code',
		label: 'Inline code',
		labelZh: '行内代码',
		icon: 'code',
		run: (view, from, to) => toggleInline(view, from, to, '`'),
	},
	{
		id: 'highlight',
		label: 'Highlight',
		labelZh: '高亮',
		icon: 'highlighter',
		run: (view, from, to) => toggleInline(view, from, to, '=='),
	},
	{
		id: 'link',
		label: 'Link',
		labelZh: '链接',
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
const CALLOUT_RE = /^>\s*\[![a-z-]+\]/i;
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

/**
 * Id of the block command a line currently is, so the palette can tint the
 * entry the caret sits in. The most specific marker wins: a callout line
 * matches both `> [!note] ` and `> `, and it is a callout.
 */
export function activeBlockId(lineText: string): string {
	const matches = BLOCK_COMMANDS.filter(
		(command) => command.id !== 'text' && lineHasPrefix(lineText, command),
	);
	matches.sort((a, b) => (b.prefix?.length ?? 0) - (a.prefix?.length ?? 0));
	return matches[0]?.id ?? 'text';
}

/** True when the line already carries the marker of `command`. */
export function lineHasPrefix(text: string, command: BlockCommand): boolean {
	if (command.detect) {
		return command.detect(text);
	}
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

/** True when the command answers to the typed query, in either language. */
export function commandMatches(command: BlockCommand, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') {
		return true;
	}
	return (
		command.label.toLowerCase().includes(q) ||
		command.labelZh.includes(q) ||
		command.id.includes(q) ||
		command.keywords.some((keyword) => keyword.toLowerCase().includes(q))
	);
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
