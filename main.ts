// The program half of this entry (Node 22, standard library only). The game is game/: plain static
// files a desktop browser opens with no network request, three.js vendored beside them. This file
// copies game/ and screenshots/ to /output and writes /output/dossier.json — the summary the judge
// reads — with the vendored make.fun library. Nothing here draws a frame; the game does that.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });

// The four pictures are captured from this build with a headless desktop browser, at 1280x720, and
// only the ones that exist are copied: the cover is the first by name.
const shots = existsSync(join(here, 'screenshots')) ? readdirSync(join(here, 'screenshots')).sort() : [];
for (const name of shots) {
  const source = join(here, 'screenshots', name);
  if (statSync(source).isFile()) cpSync(source, join(out, 'screenshots', name));
}

// The scorer's own caps: text_max_bytes shapes the dossier, the rest refuse an entry the scorer
// would refuse (more than 4 screenshots or one over 256 KiB, more than 993 files in game/ or 48 MiB
// of game files, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`sirocco: wrote ${join(out, 'dossier.json')} (${shots.length} screenshots)`);
