import compromise from 'compromise';
import dates from 'compromise-dates';
import stats from 'compromise-stats';

export const nlp = compromise;

nlp.extend(dates);
nlp.extend(stats);

type ValueDoc = ReturnType<typeof nlp> & { get: () => number | number[] | object[] };

export type CompromiseDoc = ReturnType<typeof nlp> & {
	dates: () => ReturnType<typeof nlp> & { get: () => object[] };
	times: () => ReturnType<typeof nlp> & { get: () => object[] };
	durations: () => ReturnType<typeof nlp>;
	ngrams: (options?: { min: number; max: number } | { size: number }) => object[];
	unigrams: (index?: number) => object[];
	bigrams: (index?: number) => object[];
	trigrams: (index?: number) => object[];
	startgrams: (options?: { min: number; max: number } | { size: number }) => object[];
	endgrams: (options?: { min: number; max: number } | { size: number }) => object[];
	edgegrams: (options?: { min: number; max: number } | { size: number }) => object[];
	tfidf: (options?: { form?: 'root' | 'normal' | 'text' }) => [word: string, score: number][];
	urls: () => ReturnType<typeof nlp>;
	emails: () => ReturnType<typeof nlp>;
	phoneNumbers: () => ReturnType<typeof nlp>;
	hashTags: () => ReturnType<typeof nlp>;
	atMentions: () => ReturnType<typeof nlp>;
	emojis: () => ReturnType<typeof nlp>;
	emoticons: () => ReturnType<typeof nlp>;
	money: () => ValueDoc;
	percentages: () => ValueDoc;
	fractions: () => ValueDoc;
	acronyms: () => ReturnType<typeof nlp>;
	hyphenated: () => ReturnType<typeof nlp>;
	quotations: () => ReturnType<typeof nlp>;
	parentheses: () => ReturnType<typeof nlp>;
};

export function createCompromiseDoc(text: string) {
	return nlp(text) as CompromiseDoc;
}
