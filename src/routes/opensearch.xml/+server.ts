import type { RequestHandler } from './$types';

const xmlEntities: Record<string, string> = {
	'<': '&lt;',
	'>': '&gt;',
	'&': '&amp;',
	"'": '&apos;',
	'"': '&quot;'
};

export const GET: RequestHandler = ({ url }) => {
	const origin = escapeXml(url.origin);
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
	<ShortName>Whiz</ShortName>
	<Description>Execute Whiz searches and bangs</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Url type="text/html" template="${origin}/go?q={searchTerms}" />
	<Url type="application/opensearchdescription+xml" rel="self" template="${origin}/opensearch.xml" />
</OpenSearchDescription>
`;

	return new Response(body, {
		headers: {
			'content-type': 'application/opensearchdescription+xml; charset=utf-8'
		}
	});
};

function escapeXml(value: string) {
	return value.replace(/[<>&'"]/g, (character) => {
		return xmlEntities[character]!;
	});
}
