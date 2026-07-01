import { normalizeBangCode, parseBangCodeInput } from './bang-code';

export const MY_BANG_SHARE_PARAM = 'mybang';

const MY_BANG_SHARE_VERSION = 1;
const MAX_MY_BANG_SHARE_PAYLOAD_LENGTH = 8192;

export type SharedMyBangDraft = {
	name: string;
	code: string[];
	urlTemplate: string;
};

export type SharedMyBangHashState = {
	payload: string;
	draft: SharedMyBangDraft;
};

type SharedMyBangPayload = {
	v: typeof MY_BANG_SHARE_VERSION;
	name: string;
	code: string[];
	urlTemplate: string;
};

export function createSharedMyBangHash(draft: SharedMyBangDraft) {
	const payload = encodeSharedMyBangDraft(draft);
	if (!payload) return undefined;

	const params = new URLSearchParams();
	params.set(MY_BANG_SHARE_PARAM, payload);

	return `#${params.toString()}`;
}

export function readSharedMyBangHash(hash: string): SharedMyBangHashState | undefined {
	const params = getHashParams(hash);
	const payload = params.get(MY_BANG_SHARE_PARAM);

	if (!payload || payload.length > MAX_MY_BANG_SHARE_PAYLOAD_LENGTH) return undefined;

	const draft = decodeSharedMyBangDraft(payload);
	return draft ? { payload, draft } : undefined;
}

export function removeSharedMyBangHash(hash: string) {
	const params = getHashParams(hash);
	params.delete(MY_BANG_SHARE_PARAM);

	const nextHash = params.toString();
	return nextHash ? `#${nextHash}` : '';
}

function encodeSharedMyBangDraft(draft: SharedMyBangDraft) {
	const normalized = normalizeSharedMyBangDraft({
		v: MY_BANG_SHARE_VERSION,
		name: draft.name,
		code: draft.code,
		urlTemplate: draft.urlTemplate
	});

	if (!normalized) return undefined;

	const payload = encodeBase64UrlUtf8(JSON.stringify(normalized));
	if (!payload || payload.length > MAX_MY_BANG_SHARE_PAYLOAD_LENGTH) return undefined;

	return payload;
}

function decodeSharedMyBangDraft(payload: string) {
	const json = decodeBase64UrlUtf8(payload);
	if (!json) return undefined;

	try {
		return normalizeSharedMyBangDraft(JSON.parse(json));
	} catch {
		return undefined;
	}
}

function normalizeSharedMyBangDraft(value: unknown): SharedMyBangPayload | undefined {
	if (!value || typeof value !== 'object') return undefined;

	const payload = value as Partial<SharedMyBangPayload>;
	const name = normalizeSharedText(payload.name);
	const urlTemplate = normalizeSharedText(payload.urlTemplate);
	const code = normalizeSharedCodes(payload.code);

	if (payload.v !== MY_BANG_SHARE_VERSION || !name || !urlTemplate || !code.length) {
		return undefined;
	}

	return {
		v: MY_BANG_SHARE_VERSION,
		name,
		code,
		urlTemplate
	};
}

function normalizeSharedText(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeSharedCodes(value: unknown) {
	if (!Array.isArray(value)) return [];
	if (value.some((item) => typeof item !== 'string' || /[\s,]/.test(item))) return [];

	const parsed = parseBangCodeInput(value.join(' '));

	if (parsed.invalidTokens.length || parsed.duplicateCodes.length) return [];

	return parsed.codes.map(normalizeBangCode);
}

function getHashParams(hash: string) {
	return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

function encodeBase64UrlUtf8(value: string) {
	if (typeof TextEncoder === 'undefined' || typeof btoa !== 'function') return undefined;

	const bytes = new TextEncoder().encode(value);
	let binary = '';
	const chunkSize = 0x8000;

	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}

	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlUtf8(value: string) {
	if (typeof TextDecoder === 'undefined' || typeof atob !== 'function') return undefined;

	try {
		const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);

		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}

		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}
