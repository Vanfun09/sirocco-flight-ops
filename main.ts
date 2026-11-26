// The program half of the entry. It assembles the directory the grader opens: a verbatim copy of
// game/, the renders that ship with it, and the dossier describing both. Everything it needs is in
// the Node standard library, so `node main.ts` runs it straight from source without a build step.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

// The repository root this file sits in. Taken from the module's own location rather than the
// working directory, so the program behaves the same however the grader invokes it.
const REPO_ROOT = import.meta.dirname;

// What the entry is allowed to hand in. The scorer applies these same numbers to what we produce,
// so we refuse our own input here instead of letting the dossier fail later with a vaguer message.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The destination: MAKEFUN_OUTPUT_DIR when it names something, otherwise the grader's /output.
function outputDirectory(): string {
  const configured = process.env.MAKEFUN_OUTPUT_DIR?.trim();
  return resolve(configured !== undefined && configured !== '' ? configured : '/output');
}

// Guard the step below: clearing the destination must never be able to take the repository with it,
// which is what MAKEFUN_OUTPUT_DIR=. or a parent path would otherwise do.
function assertOutsideRepository(directory: string): void {
  const within = relative(directory, REPO_ROOT);
  if (within === '' || (!within.startsWith('..') && !isAbsolute(within))) {
    throw new Error(`output directory ${directory} holds the repository at ${REPO_ROOT}; refusing to write there`);
  }
}

// An empty directory at `path`. A previous run's leftovers would count toward the file cap, and a
// file deleted from game/ would otherwise survive in the copy, so each staging step starts blank.
function emptyDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

// game/ copied whole: index.html, its scripts and styles, and whatever library sits under game/vendor.
function stageGame(output: string): void {
  const source = join(REPO_ROOT, 'game');
  if (statSync(source, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`no game directory at ${source}: the entry would have nothing to play`);
  }

  const destination = join(output, 'game');
  emptyDirectory(destination);
  cpSync(source, destination, { recursive: true, force: true });
}

// The renders, by filename so the first one is the cover. Returns how many were staged. Oversized
// input and too many files are errors rather than a quiet trim: a submission that silently loses a
// screenshot is worse than one that says why it stopped.
function stageScreenshots(output: string): number {
  const source = join(REPO_ROOT, 'screenshots');
  let names: string[];
  try {
    names = readdirSync(source)
      .filter((name) => statSync(join(source, name)).isFile())
      .sort();
  } catch (error) {
    throw new Error(`cannot list ${source}: ${(error as Error).message}`);
  }

  if (names.length > CAPS.screenshots.max) {
    throw new Error(`${source} holds ${names.length} images, but an entry may hand in ${CAPS.screenshots.max}`);
  }

  const oversized = names
    .map((name) => ({ name, bytes: statSync(join(source, name)).size }))
    .filter((image) => image.bytes > CAPS.screenshots.max_bytes);
  if (oversized.length > 0) {
    const listed = oversized.map((image) => `${image.name} (${image.bytes} bytes)`).join(', ');
    throw new Error(`images over the ${CAPS.screenshots.max_bytes}-byte cap: ${listed}`);
  }

  const destination = join(output, 'screenshots');
  emptyDirectory(destination);
  for (const name of names) cpSync(join(source, name), join(destination, name));
  return names.length;
}

// Read the environment, build the output directory, write the dossier, report it on one line.
function main(): void {
  const output = outputDirectory();
  assertOutsideRepository(output);
  mkdirSync(output, { recursive: true });

  stageGame(output);
  const screenshots = stageScreenshots(output);

  const dossier = join(output, 'dossier.json');
  writeFileSync(dossier, buildDossier(output, CAPS));
  console.log(`${dossier} written with ${screenshots} screenshot${screenshots === 1 ? '' : 's'}`);
}

main();
