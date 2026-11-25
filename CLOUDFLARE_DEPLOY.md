# Deploying Crownfall to Cloudflare Pages + D1

This repository is pre-configured so you can deploy **full Singleplayer, Accounts, Achievements, and Online Multiplayer** directly on **Cloudflare Pages + Cloudflare D1**—no external VPS, hardcoded account IDs, or paid add-ons required.

## What Works Out of the Box on Cloudflare Pages + D1
- **Full Crownfall Game (Singleplayer & All Expansion Phases):** Deterministic simulation engine, Web Worker, WebGL map renderer, audio, Development Paths, National Choices, National Operations, Rebellions, and Stable Hegemony.
- **Online Multiplayer Lobbies, Matchmaking & Lockstep Gameplay:** Powered by Cloudflare Pages Functions (`functions/api/_mp.ts`, `functions/api/mp/*`, `functions/w0/*`, `functions/w1/*`) + Cloudflare D1 (`mp_games`, `mp_clients`, `mp_intents`, `mp_matchmaking`):
  - Auto-scheduled rotating **Public Matches** (FFA, Teams, Special)
  - **Create Lobby** (Private or Publicly Listed custom lobbies, shareable invite links, host settings, kick, spectate, countdowns, successor lobbies)
  - **Join Lobby** (join by lobby code, pasted link, direct URL, or open lobby browser)
  - **Ranked 1v1 & 2v2 Matchmaking**
  - **Deterministic 100ms Lockstep Relay** (`HttpMultiplayerTransport`)
- **Unified Crownfall Accounts & Achievements:** Backed by Cloudflare Pages Functions (`functions/api/auth/*`) + D1 (`accounts`, `sessions`). Saves your Commander Name and solo map medals permanently with PBKDF2-SHA256 password hashing and `HttpOnly` session cookies.
- **Automatic Table Initialization:** Crownfall's Pages Functions automatically run `CREATE TABLE IF NOT EXISTS` on first use once `DB` is bound (and you can also apply [`migrations/0001_create_accounts.sql`](./migrations/0001_create_accounts.sql) manually if you prefer).
- **Asset Size Compliance:** `npm run build:cloudflare` builds `static/` and automatically prunes any single file over 24 MiB so Cloudflare Pages' 25 MiB per-file limit never blocks a deploy.

---

## Step-by-Step Setup (Any Cloudflare Account)

### 1. Create Your Cloudflare D1 Database
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, open **Storage & Databases** → **D1 SQL Database** → click **Create Database**.
3. Name it **`crownfall-db`** (or any name you like) and click **Create**.
4. *(Optional — tables also auto-create on first request)* Open your database's **Console** tab, paste the contents of [`migrations/0001_create_accounts.sql`](./migrations/0001_create_accounts.sql), and click **Execute** (or via CLI: `npx wrangler d1 execute crownfall-db --remote --file=migrations/0001_create_accounts.sql`).

### 2. Connect Your Git Repo to Cloudflare Pages
1. Go to **Compute (Workers & Pages)** → **Create** → **Pages** → **Connect to Git** and select your `CrownFall` repository.
2. Configure the build settings:
   - **Build command:** `npm run build:cloudflare`
   - **Build output directory:** `static`
   - **Environment variable:** `NODE_VERSION` = `24`
3. Click **Save and Deploy**.

### 3. Bind D1 to Your Cloudflare Pages Project
1. Open your Pages project in the Cloudflare Dashboard → **Settings** → **Bindings** (or **Functions** → **D1 database bindings**).
2. Click **Add** → **D1 database**:
   - **Variable name:** `DB` *(must be exact uppercase `DB`)*
   - **D1 database:** select `crownfall-db`
3. Click **Save** (bind for both **Production** and **Preview** environments if desired).
4. Go to **Deployments** → click the **`⋯`** menu on your latest deployment → **Retry deployment** (or push a new commit) so the `DB` binding becomes active!
