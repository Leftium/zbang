import nlp from 'compromise';
import dates from 'compromise-dates';
import stats from 'compromise-stats';

nlp.extend(dates);
nlp.extend(stats);

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
	tfidf: () => [word: string, freq: number][];
};

export function createCompromiseDoc(text: string) {
	return nlp(text) as CompromiseDoc;
}
