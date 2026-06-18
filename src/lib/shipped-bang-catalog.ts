import { Err, Ok, type Result } from 'wellcrafted/result';

import duckDuckGoCatalogUrl from '$catalogs/zbang.catalog.duckduckgo.json?url';
import kagiCatalogUrl from '$catalogs/zbang.catalog.kagi.json?url';
import { validateZbangCatalog, type BangProviderId, type ZbangCatalog } from '$lib/bang-catalog';

type CatalogLoadError =
	| { kind: 'network'; message: string }
	| { kind: 'http'; status: number; statusText: string }
	| { kind: 'parse'; message: string }
	| { kind: 'validation'; message: string };

const catalogUrls: Record<BangProviderId, string> = {
	duckduckgo: duckDuckGoCatalogUrl,
	kagi: kagiCatalogUrl
};

export async function loadShippedBangCatalog(
	provider: BangProviderId
): Promise<Result<ZbangCatalog, CatalogLoadError>> {
	const url = catalogUrls[provider];
	let response: Response;

	try {
		response = await fetch(url);
	} catch (error) {
		return Err({ kind: 'network', message: getErrorMessage(error) });
	}

	if (!response.ok) {
		return Err({ kind: 'http', status: response.status, statusText: response.statusText });
	}

	let catalog: unknown;

	try {
		catalog = await response.json();
	} catch (error) {
		return Err({ kind: 'parse', message: getErrorMessage(error) });
	}

	const errors = validateZbangCatalog(catalog, provider);

	if (errors.length) {
		return Err({ kind: 'validation', message: errors.join('; ') });
	}

	return Ok(catalog as ZbangCatalog);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
