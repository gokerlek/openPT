import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Arayüz bağlantıları (gözden geçirmenin bulguları): kaynak metniyle sabitlenir (`editor-signals.test.ts` gibi).
const strip = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('tutamacın üstüne dokunmak öğenin işini yapar (ölü bölge yok): liste onTap verir, antrenman listesi açar', () => {
  const list = strip('./sortable-list.tsx');
  assert.match(list, /onTap=\{onTapItem \? \(\) => onTapItem\(itemKey\) : undefined\}/);
  assert.match(strip('../../app/me/antrenman/workout-list.tsx'), /onTapItem=\{onOpen\}/);
  assert.match(strip('../../app/dashboard/exercises/exercise-form.tsx'), /onTapItem=/);
  assert.match(strip('../../app/dashboard/clients/[id]/program/phases-card.tsx'), /onTapItem=/);
});

test('düz listelerde dokunmatik sürükleme basılı tutmayla başlar (kaydırırken kazara taşıma yok)', () => {
  assert.match(strip('./sortable-list.tsx'), /useListSensors\(\{ touchHold: true \}\)/);
  assert.match(strip('./dnd-base.ts'), /TouchSensor[\s\S]*delay: DRAG\.touchHoldMs/);
});

test('açık panel varken başka bir kaydırma satırına dokunmak yalnız kapatır (set tablosu da)', () => {
  assert.match(strip('../swipe/swipe-row.tsx'), /const CARD = '[^']*\[data-slot=swipe-row\]/);
});

test('set satırı içeriğiyle büyür (kardiyoda kalori satırı kırpılmaz)', () => {
  const row = strip('../../app/me/antrenman/set-row.tsx');
  assert.match(row, /'grid min-h-12 /);
  assert.doesNotMatch(row, /'grid h-12 /);
});
