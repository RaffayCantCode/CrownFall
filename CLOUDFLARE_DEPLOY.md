# Deploying Crownfall to Cloudflare Pages + D1

This repository is pre-configured so you can push or connect it to **any** Cloudflare account—no account IDs or secrets are hardcoded.

## What Works Out of the Box on Cloudflare Pages + D1
- **Full Crownfall Game (Singleplayer & All 8 Expansion Phases):** The entire deterministic simulation engine, Web Worker, WebGL map renderer, audio, icons, Development Paths, National Choices, National Operations, Rebellions, and Stable Hegemony run 100% in the browser.
- **Persistent User Accounts & Saved Commander Names (Cloudflare D1):** Powered by Cloudflare Pages Functions (`functions/api/auth/*`) backed by a Cloudflare D1 SQLite database. Passwords are salted and hashed with PBKDF2-SHA256 using native Web Crypto, and sessions use `HttpOnly` cookies.
- **Asset Size Compliance:** `npm run build:cloudflare` builds `static/` and automatically prunes any single file over 24 MiB (`world10000/map.bin` at ~47.7 MB) so Cloudflare Pages' 25 MiB per-file limit never blocks a deploy.

> **Note on Live Online Multiplayer:** Real-time multiplayer lobbies (`src/server/Server.ts`) currently run on a stateful Node.js WebSocket server, which Cloudflare Pages cannot host directly. To enable live multiplayer later, either deploy `src/server/Server.ts` on a Node host (e.g., Railway, Fly.io, or Cloudflare Containers) or port the lobby relay to Cloudflare Durable Objects.

---

## Step-by-Step Setup (Any Cloudflare Account)

### 1. Create Your Cloudflare D1 Database
1. Open the **Cloudflare Dashboard** → **Storage & Databases** → **D1 SQL Database** → **Create**.
2. Name it `crownfall-db` (or any name you prefer).
3. Open the database's **Console** tab and run the SQL from [`migrations/0001_create_accounts.sql`](./migrations/0001_create_accounts.sql) (or via CLI: `npx wrangler d1 execute crownfall-db --remote --file=migrations/0001_create_accounts.sql`).

### 2. Connect Your Git Repo to Cloudflare Pages
1. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git** and select your Crownfall repository.
2. Configure the build settings:
   - **Build command:** `npm run build:cloudflare`
   - **Build output directory:** `static`
   - **Node version environment variable:** `NODE_VERSION = 24`
3. Deploy!

### 3. Bind D1 to Your Pages Project
1. Open your new Pages project → **Settings** → **Bindings** → **Add** → **D1 database**.
2. Set **Variable name** to **`DB`** (exact uppercase `DB`) and select `crownfall-db`.
3. Trigger a redeploy (or push a commit) so the binding takes effect.

Your players can now click **Account** on the Crownfall title screen to register, sign in, and save their Commander Name directly in Cloudflare D1!
