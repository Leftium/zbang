// In conjunction with adapter-static, add prerender option to the root layout:
// https://svelte.dev/docs/kit/adapter-static
// https://svelte.dev/docs/kit/page-options#prerender
export const prerender = true

// Turn any SvelteKit app into SPA by disabling SSR at the root layout:
// https://svelte.dev/docs/kit/single-page-apps
// https://svelte.dev/docs/kit/page-options#ssr
export const ssr = false

// Force trailing slashes to simplify relative URLs:
// https://svelte.dev/docs/kit/page-options#trailingSlash
export const trailingSlash = 'always'
