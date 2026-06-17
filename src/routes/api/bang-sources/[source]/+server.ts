import { error, text } from '@sveltejs/kit';

import { getBangSource } from '$lib/bang-data';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, params }) => {
	const source = getBangSource(params.source);

	if (!source) {
		error(404, 'Unknown bang source');
	}

	const response = await fetch(source.url);

	if (!response.ok) {
		error(response.status, `Failed to fetch ${source.label}`);
	}

	return text(await response.text(), {
		headers: {
			'cache-control': 'no-store'
		}
	});
};
