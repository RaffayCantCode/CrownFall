/**
 * Post-build sanitizer for Cloudflare Pages uploads.
 *
 * Cloudflare Pages enforces a 25 MiB per-file limit across the static output
 * directory (`static/`). The ultra-high-res `world10000/map.bin` (~47.7 MB)
 * exceeds that cap while all other 2,400+ assets are well under 12 MB.
 *
 * This script removes any single file > 24 MiB from `static/` so your
 * Cloudflare Pages deploy succeeds cleanly on any Cloudflare account.
 */
import fs from "fs";
import path from "path";

const STATIC_DIR = path.resolve(process.cwd(), "static");
const MAX_BYTES = 24 * 1024 * 1024; // 24 MiB safety margin under Cloudflare Pages' 25 MiB cap

let prunedCount = 0;

function walk(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
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

walk(STATIC_DIR);
console.log(
  `[cloudflare-pages] static/ is ready for Cloudflare Pages (${prunedCount} oversized file(s) pruned).`,
);
