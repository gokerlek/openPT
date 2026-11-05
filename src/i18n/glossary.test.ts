import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Sözlükteki (`docs/i18n-glossary.md`) kesin kararlar bütün İngilizce sözlüklerde tutar. */
const MESSAGES_DIR = join(import.meta.dirname, 'messages');
const english = readdirSync(MESSAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ name: entry.name, text: readFileSync(join(MESSAGES_DIR, entry.name, 'en.ts'), 'utf8') }));

test('"hareket testi" her sözlükte "movement test": "movement screening" yok', () => {
  assert.deepEqual(english.filter(({ text }) => /movement screening/i.test(text)).map(({ name }) => name), []);
});
