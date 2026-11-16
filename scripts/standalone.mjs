// Copies the single-file build to release/CaptionStitch.html so there is always
// one self-contained file to keep, send to someone, or open straight from disk.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'dist/index.html');
const to = resolve(root, 'release/CaptionStitch.html');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`release/CaptionStitch.html  ${(statSync(to).size / 1024).toFixed(1)} kB`);
