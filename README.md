# zbang

More powerful, more user-friendly bang search.

## Development

```sh
pnpm install
pnpm dev
```

## Scripts

```sh
pnpm check
pnpm lint
pnpm build
```

## Bang Data

The app ships static bootstrap bang catalogs and can refresh full DuckDuckGo/Kagi source data into IndexedDB from the settings page. In dev mode, `/dev/bootstrap-bangs` generates replacement bootstrap JSON files from refreshed local catalogs.

<details>
<summary>This is a SvelteKit project; auto-generated README.</summary>

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.16.1 create --template minimal --types ts --add prettier eslint --install pnpm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

</details>
