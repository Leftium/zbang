import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	BANG_SOURCES,
	countSourceBangs,
	generateDuckDuckGoCatalog,
	generateKagiCatalog,
	validateZbangCatalog,
	type BangProviderId,
	type BangSourceId,
	type PersistedBangSource,
	type ZbangCatalog
} from '../src/lib/bang-catalog.ts';

type CatalogOutput = {
	provider: BangProviderId;
	filename: string;
	catalog: ZbangCatalog;
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogDir = resolve(rootDir, 'catalogs');

async function main() {
	const sources = new Map(
		(await Promise.all(BANG_SOURCES.map(downloadSource))).map((source) => [source.id, source])
	);
	const duckDuckGoSource = requireSource(sources, 'duckduckgo');
	const outputs: CatalogOutput[] = [
		{
			provider: 'duckduckgo',
			filename: 'zbang.catalog.duckduckgo.json',
			catalog: generateDuckDuckGoCatalog(duckDuckGoSource)
		},
		{
			provider: 'kagi',
			filename: 'zbang.catalog.kagi.json',
			catalog: generateKagiCatalog(
				requireSource(sources, 'kagi-shared'),
				requireSource(sources, 'kagi-kagi'),
				duckDuckGoSource
			)
		}
	];

	await mkdir(catalogDir, { recursive: true });

	for (const output of outputs) {
		const errors = validateZbangCatalog(output.catalog, output.provider);

		if (errors.length) {
			throw new Error(`${output.provider} catalog failed validation:\n${errors.join('\n')}`);
		}

		const json = `${JSON.stringify(output.catalog, null, '\t')}\n`;
		const path = resolve(catalogDir, output.filename);
		await writeFile(path, json);

		console.log(
			[
				`${output.provider}: ${output.catalog.items.length.toLocaleString()} records`,
				`${output.catalog.dedupedCount?.toLocaleString() ?? 0} deduped`,
				`${Buffer.byteLength(json).toLocaleString()} bytes`,
				path
			].join(' | ')
		);
	}

	for (const source of sources.values()) {
		console.log(
			[
				`${source.id}: ${source.bangCount?.toLocaleString() ?? 'unknown'} source records`,
				`sha256 ${source.hash}`,
				source.url
			].join(' | ')
		);
	}
}

async function downloadSource(source: (typeof BANG_SOURCES)[number]): Promise<PersistedBangSource> {
	const response = await fetch(source.url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${source.label}: ${response.status} ${response.statusText}`);
	}

	const text = await response.text();

	return {
		id: source.id,
		url: source.url,
		fetchedAt: new Date().toISOString(),
		hash: createHash('sha256').update(text).digest('hex'),
		bangCount: countSourceBangs(text),
		text
	};
}

function requireSource(sources: Map<BangSourceId, PersistedBangSource>, id: BangSourceId) {
	const source = sources.get(id);

	if (!source) {
		throw new Error(`${id} source has not been downloaded`);
	}

	return source;
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
