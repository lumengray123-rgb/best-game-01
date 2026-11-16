// EMBERWARDEN's entrypoint (Node 22, standard library only). It hands the
// game in: game/ and screenshots/ are copied beside this file into the output
// directory, and dossier.json — the summary the judge reads — is written with
// the vendored make.fun library. The grader runs this twice in a sandbox with
// no network; both runs must write the same bytes.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The gate's caps for this bounty, from the kit's RULES.txt. Only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry the
// scorer would refuse, so this program fails loudly where the scorer would.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy a directory tree file by file (no symlinks are followed: the gate
// refuses them, so a link here is an error, not a copy).
function copyTree(sourceDir: string, destDir: string, seen: string[]): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const from = join(sourceDir, entry.name);
    const to = join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to copy a symbolic link: ${relative(REPO_ROOT, from)}`);
    }
    if (entry.isDirectory()) {
      copyTree(from, to, seen);
    } else if (entry.isFile()) {
      seen.push(relative(REPO_ROOT, from));
      writeFileSync(to, readFileSync(from));
    }
  }
}

// A quick pre-flight pass over what was copied, so a broken entry fails here
// with a plain message instead of deep inside the dossier builder.
function preflight(outDir: string): void {
  const gameDir = join(outDir, 'game');
  const indexHtml = join(gameDir, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error('game/index.html is missing: a game needs its page at game/index.html');
  }
  const indexBytes = statSync(indexHtml).size;
  if (indexBytes > 1024 * 1024) {
    throw new Error(`game/index.html is ${indexBytes} bytes, over the 1 MiB a page may be`);
  }
  const shotsDir = join(outDir, 'screenshots');
  if (!existsSync(shotsDir)) {
    throw new Error('screenshots/ is missing: an entry needs 3 or 4 screenshots');
  }
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`screenshots/ holds ${shots.length} images, but an entry needs 3 or 4`);
  }
  for (const shot of shots) {
    const bytes = statSync(join(shotsDir, shot)).size;
    if (bytes > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${shot} is ${bytes} bytes, over the 256 KiB an image may be`);
    }
    if (!/\.(png|jpe?g)$/i.test(shot)) {
      throw new Error(`screenshots/${shot} is neither a PNG nor a JPEG`);
    }
  }
}

function main(): void {
  const copied: string[] = [];
  mkdirSync(OUT_DIR, { recursive: true });
  copyTree(join(REPO_ROOT, 'game'), join(OUT_DIR, 'game'), copied);
  copyTree(join(REPO_ROOT, 'screenshots'), join(OUT_DIR, 'screenshots'), copied);
  preflight(OUT_DIR);

  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

  const shots = readdirSync(join(OUT_DIR, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
  console.log(`EMBERWARDEN handed in: ${copied.length} files, cover ${shots[0]}, dossier ${dossier.length} bytes.`);
}

main();
