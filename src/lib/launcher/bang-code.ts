import type { ZbangRecord } from '../bang-catalog';

export type BangCodeParseResult = {
	codes: string[];
	duplicateCodes: string[];
	invalidTokens: string[];
};

export function normalizeBangCode(code: string) {
	const trimmed = code.trim();
	const bangless = trimmed.startsWith('!') ? trimmed.slice(1) : trimmed;

	return `!${bangless}`.toLowerCase();
}

export function displayBangCode(code: string) {
	return normalizeBangCode(code).slice(1);
}

export function formatBangCodes(codes: string[]) {
	return codes.map(displayBangCode).join(' ');
}

export function parseBangCodeInput(input: string): BangCodeParseResult {
	const tokens = input
		.split(/[\s,]+/)
		.map((token) => token.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const codes: string[] = [];
	const duplicateCodes: string[] = [];
	const invalidTokens: string[] = [];

	for (const token of tokens) {
		const bangless = token.startsWith('!') ? token.slice(1) : token;

		if (!bangless || bangless.includes('!') || /\s/.test(token)) {
			invalidTokens.push(token);
			continue;
		}

		const normalized = normalizeBangCode(token);

		if (seen.has(normalized)) {
			duplicateCodes.push(normalized);
			continue;
		}

		seen.add(normalized);
		codes.push(normalized);
	}

	return { codes, duplicateCodes, invalidTokens };
}

export function getBangCodeSet(items: ZbangRecord[]) {
	return new Set(items.flatMap((item) => item.code.map(normalizeBangCode)));
}

export function hasBangCodeOverlap(item: ZbangRecord, codes: Set<string>) {
	return item.code.some((code) => codes.has(normalizeBangCode(code)));
}

export function removeBangCodeOverlap(item: ZbangRecord, codes: Set<string>) {
	const availableCodes = item.code.map(normalizeBangCode).filter((code) => !codes.has(code));

	if (!availableCodes.length) return undefined;
	if (availableCodes.length === item.code.length) return item;

	return {
		...item,
		code: availableCodes
	};
}

export function removeBangCodeOverlaps(items: ZbangRecord[], codes: Set<string>) {
	return items.flatMap((item) => removeBangCodeOverlap(item, codes) ?? []);
}
