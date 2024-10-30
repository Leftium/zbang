# Spock-Stack-SPA-Starter (4S)

Another take on the...

## SvelteKit + Pocketbase SPA template

### Backend, frontend, and DB all in the same Docker container~ (in the same process!)

- Backend: **PocketBase**
- Frontend: **SvelteKit** SSG in SPA mode
- Database: **PocketBase** (collections powered by SQLite)

**Live Demos:**
- https://ssss.pockethost.io/
- https://ssss.pockethost.io/api/hello/WORLD

---

### Simple to use:

#### I. Clone this repo
1. `git clone https://github.com/Leftium/spock-stack-spa-starter.git`

#### II. SvelteKit
1. `cd spock-stack-spa-starter/kit`
2. `pnpm build  ## Build SvelteKit SPA`

#### III. PocketBase
(Assumes PocketBase already installed.)
1. `cd spock-stack-spa-starter/pb`
2. `pnpm build  ## Build PocketBase hooks`
3. `pnpm dev    ## Start PocketBase`
4. Open in browser: `http://127.0.0.1:8090`

### Simple to deploy:
-  **PocketHost.io:** Just copy `deploy/pb_*` output folders via FTP to your instance.
