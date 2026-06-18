import type { Zbang, ZbangCatalog } from '$lib/bang-data';
import type { BangComposition, BangCompositionTarget, BangEntry } from './types';

export function createBangCodeMap(catalog: ZbangCatalog | undefined) {
	const codeMap = new Map<string, Zbang>();

	for (const item of catalog?.items ?? []) {
		for (const code of item.code) {
			codeMap.set(normalizeBangCode(code), item);
		}
	}

	return codeMap;
}

export function parseBangComposition(
	input: string,
	codeMap: Map<string, Zbang>,
	activeEntry: BangEntry | undefined
): BangComposition {
	const localTargets: BangCompositionTarget[] = [];
	const forwardedTokens: string[] = [];
	const payloadTokens: string[] = [];
	const activeTokenStart = activeEntry?.triggerIndex;
	let offset = 0;

	for (const token of input.match(/\S+/g) ?? []) {
		const index = input.indexOf(token, offset);
		offset = index + token.length;

		if (activeTokenStart !== undefined && index === activeTokenStart) continue;

		if (!/^![^\s!]+$/.test(token)) {
			payloadTokens.push(token);
			continue;
		}

		const item = codeMap.get(normalizeBangCode(token));

		if (item) {
			localTargets.push({ token, item });
		} else {
			forwardedTokens.push(token);
		}
	}

	return {
		localTargets,
		forwardedTokens,
		payloadText: payloadTokens.join(' '),
		hasTargets: Boolean(localTargets.length || forwardedTokens.length)
	};
}

function normalizeBangCode(code: string) {
	return (code.startsWith('!') ? code : `!${code}`).toLowerCase();
}
