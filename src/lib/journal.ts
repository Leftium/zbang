import { deleteFromStore, getAllFromStore, openWhizDb, putInStore } from './bang-data';

const JOURNAL_ENTRY_STORE = 'journalEntries';

export type JournalEntry = {
	id: string;
	entryDate: string;
	createdAt: string;
	updatedAt: string;
	bodyMarkdown: string;
	title?: string;
	tags?: string[];
};

export type JournalEntryInput = {
	entryDate: string;
	bodyMarkdown: string;
	title?: string;
	tags?: string[];
};

export type JournalMarkdownInline =
	| { kind: 'text'; text: string }
	| { kind: 'code'; text: string }
	| { kind: 'strong'; text: string }
	| { kind: 'em'; text: string }
	| { kind: 'link'; text: string; href: string };

export type JournalMarkdownBlock =
	| { kind: 'heading'; level: 2 | 3 | 4; children: JournalMarkdownInline[] }
	| { kind: 'paragraph'; children: JournalMarkdownInline[] }
	| { kind: 'list'; ordered: boolean; items: JournalMarkdownInline[][] }
	| { kind: 'blockquote'; children: JournalMarkdownInline[] }
	| { kind: 'code'; text: string };

export async function listJournalEntries(): Promise<JournalEntry[]> {
	const db = await openWhizDb();

	try {
		const entries = await getAllFromStore<JournalEntry>(db, JOURNAL_ENTRY_STORE);

		return entries.sort(
			(a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt)
		);
	} finally {
		db.close();
	}
}

export async function createJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
	const now = new Date().toISOString();
	const entry = normalizeJournalEntry({
		id: createJournalEntryId(),
		createdAt: now,
		updatedAt: now,
		...input
	});

	const db = await openWhizDb();

	try {
		await putInStore(db, JOURNAL_ENTRY_STORE, entry);
		return entry;
	} finally {
		db.close();
	}
}

export async function updateJournalEntry(entry: JournalEntry): Promise<JournalEntry> {
	const nextEntry = normalizeJournalEntry({
		...entry,
		updatedAt: new Date().toISOString()
	});

	const db = await openWhizDb();

	try {
		await putInStore(db, JOURNAL_ENTRY_STORE, nextEntry);
		return nextEntry;
	} finally {
		db.close();
	}
}

export async function deleteJournalEntry(id: string): Promise<void> {
	const db = await openWhizDb();

	try {
		await deleteFromStore(db, JOURNAL_ENTRY_STORE, id);
	} finally {
		db.close();
	}
}

export function getJournalEntryTitle(entry: Pick<JournalEntry, 'bodyMarkdown' | 'title'>) {
	if (entry.title?.trim()) return entry.title.trim();

	const firstContentLine = entry.bodyMarkdown
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);

	if (!firstContentLine) return 'Journal entry';

	return stripMarkdownSyntax(firstContentLine).slice(0, 80) || 'Journal entry';
}

export function getJournalEntryExcerpt(entry: Pick<JournalEntry, 'bodyMarkdown'>) {
	const text = stripMarkdownSyntax(entry.bodyMarkdown).replace(/\s+/g, ' ').trim();

	return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export function getLocalJournalDate(date = new Date()) {
	const year = date.getFullYear().toString().padStart(4, '0');
	const month = (date.getMonth() + 1).toString().padStart(2, '0');
	const day = date.getDate().toString().padStart(2, '0');

	return `${year}-${month}-${day}`;
}

export function parseJournalMarkdown(markdown: string): JournalMarkdownBlock[] {
	const blocks: JournalMarkdownBlock[] = [];
	let paragraphLines: string[] = [];
	let listItems: JournalMarkdownInline[][] = [];
	let orderedList = false;
	let blockquoteLines: string[] = [];
	let codeLines: string[] = [];
	let inCodeFence = false;

	const flushParagraph = () => {
		if (!paragraphLines.length) return;
		blocks.push({ kind: 'paragraph', children: parseInlineMarkdown(paragraphLines.join(' ')) });
		paragraphLines = [];
	};
	const flushList = () => {
		if (!listItems.length) return;
		blocks.push({ kind: 'list', ordered: orderedList, items: listItems });
		listItems = [];
		orderedList = false;
	};
	const flushBlockquote = () => {
		if (!blockquoteLines.length) return;
		blocks.push({ kind: 'blockquote', children: parseInlineMarkdown(blockquoteLines.join(' ')) });
		blockquoteLines = [];
	};
	const flushCodeFence = () => {
		blocks.push({ kind: 'code', text: codeLines.join('\n') });
		codeLines = [];
	};
	const flushAllTextBlocks = () => {
		flushParagraph();
		flushList();
		flushBlockquote();
	};

	for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
		if (line.trim().startsWith('```')) {
			if (inCodeFence) {
				flushCodeFence();
				inCodeFence = false;
			} else {
				flushAllTextBlocks();
				inCodeFence = true;
				codeLines = [];
			}
			continue;
		}

		if (inCodeFence) {
			codeLines.push(line);
			continue;
		}

		if (!line.trim()) {
			flushAllTextBlocks();
			continue;
		}

		const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
		if (headingMatch) {
			flushAllTextBlocks();
			blocks.push({
				kind: 'heading',
				level: (headingMatch[1].length + 1) as 2 | 3 | 4,
				children: parseInlineMarkdown(headingMatch[2].trim())
			});
			continue;
		}

		const orderedMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
		const unorderedMatch = /^\s*[-*+]\s+(.+)$/.exec(line);
		if (orderedMatch || unorderedMatch) {
			flushParagraph();
			flushBlockquote();

			const nextOrdered = Boolean(orderedMatch);
			if (listItems.length && nextOrdered !== orderedList) flushList();

			orderedList = nextOrdered;
			listItems.push(parseInlineMarkdown((orderedMatch ?? unorderedMatch)?.[1].trim() ?? ''));
			continue;
		}

		const blockquoteMatch = /^\s*>\s?(.+)$/.exec(line);
		if (blockquoteMatch) {
			flushParagraph();
			flushList();
			blockquoteLines.push(blockquoteMatch[1].trim());
			continue;
		}

		flushList();
		flushBlockquote();
		paragraphLines.push(line.trim());
	}

	if (inCodeFence) flushCodeFence();
	flushAllTextBlocks();

	return blocks;
}

function normalizeJournalEntry(entry: JournalEntry): JournalEntry {
	const title = normalizeOptionalString(entry.title);
	const tags = entry.tags
		?.map((tag) => tag.trim())
		.filter(Boolean)
		.filter((tag, index, allTags) => allTags.indexOf(tag) === index);

	return {
		id: entry.id,
		entryDate: normalizeJournalDate(entry.entryDate),
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		bodyMarkdown: entry.bodyMarkdown.trim(),
		...(title ? { title } : {}),
		...(tags?.length ? { tags } : {})
	};
}

function normalizeJournalDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getLocalJournalDate();
}

function normalizeOptionalString(value: string | undefined) {
	const trimmed = value?.trim();

	return trimmed || undefined;
}

function createJournalEntryId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `journal:${crypto.randomUUID()}`;
	}

	return `journal:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function stripMarkdownSyntax(markdown: string) {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
		.replace(/[*_~#>`]/g, '');
}

function parseInlineMarkdown(input: string): JournalMarkdownInline[] {
	const nodes: JournalMarkdownInline[] = [];
	const tokenPattern =
		/(`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = tokenPattern.exec(input))) {
		if (match.index > lastIndex) {
			nodes.push({ kind: 'text', text: input.slice(lastIndex, match.index) });
		}

		if (match[2]) {
			nodes.push({ kind: 'code', text: match[2] });
		} else if (match[3] && match[4]) {
			const safeHref = getSafeMarkdownHref(match[4]);

			if (safeHref) {
				nodes.push({ kind: 'link', text: match[3], href: safeHref });
			} else {
				nodes.push({ kind: 'text', text: `${match[3]} (${match[4]})` });
			}
		} else if (match[5] || match[6]) {
			nodes.push({ kind: 'strong', text: match[5] ?? match[6] ?? '' });
		} else if (match[7] || match[8]) {
			nodes.push({ kind: 'em', text: match[7] ?? match[8] ?? '' });
		}

		lastIndex = tokenPattern.lastIndex;
	}

	if (lastIndex < input.length) {
		nodes.push({ kind: 'text', text: input.slice(lastIndex) });
	}

	return nodes;
}

function getSafeMarkdownHref(value: string) {
	try {
		const baseHref = typeof window === 'undefined' ? 'https://whiz.local/' : window.location.href;
		const url = new URL(value, baseHref);

		if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
			return url.toString();
		}
	} catch {
		return undefined;
	}

	return undefined;
}
