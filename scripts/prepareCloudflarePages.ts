/**
 * Post-build sanitizer & static HTML renderer for Cloudflare Pages uploads.
 *
 * 1. Prunes any single file > 24 MiB from `static/` (Cloudflare Pages enforces
 *    a 25 MiB per-file cap; `world10000/map.*.bin` is ~47.7 MB while all other
 *    2,400+ assets are well under 12 MB).
 * 2. Pre-renders the EJS placeholders in `static/index.html` (which the Node
 *    Express server normally evaluates at request time) using the build's
 *    `static/asset-manifest.json`, so Cloudflare Pages serves valid HTML with
 *    all hashed asset paths, scripts, styles, and runtime globals intact.
 * 3. Writes `static/_headers` for immutable caching of hashed assets.
 */
import {
  type AssetManifest,
  buildAssetUrl,
} from "@openfront/shared/AssetPaths";
import ejs from "ejs";
import fs from "fs";
import path from "path";

const STATIC_DIR = path.resolve(process.cwd(), "static");
const MAX_BYTES = 24 * 1024 * 1024; // 24 MiB safety margin under Cloudflare Pages' 25 MiB cap

let prunedCount = 0;

function pruneOversizedFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneOversizedFiles(full);
    } else if (entry.isFile()) {
      const stat = fs.statSync(full);
      if (stat.size > MAX_BYTES) {
        const mb = (stat.size / (1024 * 1024)).toFixed(2);
        fs.unlinkSync(full);
        prunedCount++;
        console.log(
          `[cloudflare-pages] Pruned oversized asset (${mb} MB > 24 MB): ${path.relative(STATIC_DIR, full)}`,
        );
      }
    }
  }
}

function loadAssetManifest(): AssetManifest {
  const manifestPath = path.join(STATIC_DIR, "asset-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.warn("[cloudflare-pages] static/asset-manifest.json not found; using empty manifest.");
    return {};
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as AssetManifest;
}

function prerenderIndexHtml(assetManifest: AssetManifest): void {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`[cloudflare-pages] Missing ${indexPath}`);
  }

  const rawHtml = fs.readFileSync(indexPath, "utf-8");
  const cdnBase = "";
  const gitCommit = (process.env.CF_PAGES_COMMIT_SHA ?? "crownfall").slice(0, 8);

  const rendered = ejs.render(rawHtml, {
    gitCommit: JSON.stringify(gitCommit),
    assetManifest: JSON.stringify(assetManifest),
    cdnBase: JSON.stringify(cdnBase),
    cdnBaseRaw: cdnBase,
    gameEnv: JSON.stringify("prod"),
    cluster: JSON.stringify({ a: { host: "", numWorkers: 2 } }),
    instanceLetter: JSON.stringify("a"),
    cloudflareMultiplayer: "true",
    turnstileSiteKey: JSON.stringify(""),
    jwtAudience: JSON.stringify(""),
    manifestHref: buildAssetUrl("manifest.json", assetManifest, cdnBase),
    faviconHref: buildAssetUrl(
      "images/CrownfallCrownIcon.svg",
      assetManifest,
      cdnBase,
    ),
    gameplayScreenshotUrl: buildAssetUrl(
      "images/KeyArt.jpg",
      assetManifest,
      cdnBase,
    ),
    backgroundImageUrl: buildAssetUrl(
      "images/background.webp",
      assetManifest,
      cdnBase,
    ),
    desktopLogoImageUrl: buildAssetUrl(
      "images/crownfall/logo-crown.svg",
      assetManifest,
      cdnBase,
    ),
    mobileLogoImageUrl: buildAssetUrl(
      "images/crownfall/logo-crown.svg",
      assetManifest,
      cdnBase,
    ),
  });

  if (rendered.includes("<%")) {
    throw new Error(
      "[cloudflare-pages] Unrendered EJS tag still present in static/index.html!",
    );
  }

  fs.writeFileSync(indexPath, rendered, "utf-8");
  console.log(
    `[cloudflare-pages] Pre-rendered static/index.html (${Object.keys(assetManifest).length} manifest assets wired).`,
  );
}

function writePagesHeaders(): void {
  const headersPath = path.join(STATIC_DIR, "_headers");
  const content = `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/_assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate
`;
  fs.writeFileSync(headersPath, content, "utf-8");
}

pruneOversizedFiles(STATIC_DIR);
const manifest = loadAssetManifest();
prerenderIndexHtml(manifest);
writePagesHeaders();

console.log(
  `[cloudflare-pages] static/ is ready for Cloudflare Pages (${prunedCount} oversized file(s) pruned).`,
);
