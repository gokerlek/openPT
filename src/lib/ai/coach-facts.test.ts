import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LOCALES, type Locale } from '../../i18n/locale.ts';
import type { CareInput } from '../constraint-filter.ts';
import type { SessionIndexRow } from '../schemas/session.ts';
import { coachContextHash, coachFactsFor, generalFacts, generalHash, type CoachRecords } from './coach-facts.ts';
import { hashableFacts } from './coach-engine.ts';

/**
 * Taslak onayı değişiklik denetimini `contextHash` ile yapar: aynı kayıtlardan her dilde AYNI karma çıkmalı (İngilizce
 * hazırlanan taslak Türkçe PT'de onaylanabilsin, dil değişince taslak kaybolmasın) ve Türkçe değer dil desteği gelmeden
 * önceki kodla (openpt 98f852e: coach-service.ts / coach-global.ts) aynı olmalı: bekleyen taslaklar 412 olmasın.
 * ALTIN değerler eski kodun mantığıyla bu fikstürden hesaplandı; yeni değerle değiştirmek taslakları geçersiz kılar.
 */
const GOLDEN_CONTEXT = '77a8d5f9b746694cd9295d072eaa76225a9de5c649474eab1523c87a17ed74e2';
const GOLDEN_GENERAL = 'ee9d65f7be6ab1b7c919c9f3cd58f1cb05a0298cc57ffc46dd429fc7546d8c93';

type Catalog = { id: string; title: string }[];
const fixture = JSON.parse(readFileSync(new URL('./coach-facts.fixture.json', import.meta.url), 'utf8')) as {
  today: string;
  client: { modules: unknown; consents: unknown };
  care: CareInput;
  program: { phases: { days: unknown[] }[] };
  items: unknown[];
  catalog: Record<Locale, Catalog>;
  camera: CoachRecords['camera'];
  measurements: CoachRecords['measurements'];
  general: { total: number; allowed: number };
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const records: CoachRecords = { today: fixture.today, items: fixture.items as SessionIndexRow[], program: fixture.program, camera: fixture.camera, measurements: fixture.measurements };

function contextHash(locale: Locale, change: { care?: CareInput; records?: CoachRecords; catalogTr?: Catalog } = {}) {
  const catalogTr = change.catalogTr ?? fixture.catalog.tr;
  const parts = coachFactsFor(change.records ?? records, { shown: fixture.catalog[locale], canonical: catalogTr }, locale);
  return coachContextHash(hash, { client: fixture.client, care: change.care ?? fixture.care, canonical: parts.canonical, catalog: catalogTr, program: fixture.program });
}

describe('taslak karması dilden bağımsız ve eski değerle aynı', () => {
  test('Türkçe: eski koddan hesaplanan altın karma', () => {
    assert.equal(contextHash('tr'), GOLDEN_CONTEXT);
  });

  test('İngilizce karma Türkçeyle aynı', () => {
    assert.equal(contextHash('en'), GOLDEN_CONTEXT);
    for (const locale of LOCALES) assert.equal(contextHash(locale), contextHash('tr'));
  });

  test("bakım bilgisinin dili (`care.locale`, T4'ün ekleyeceği alan) karmayı değiştirmez; bakımın kendisi değiştirir", () => {
    for (const locale of LOCALES) assert.equal(contextHash('tr', { care: { ...fixture.care, locale } }), GOLDEN_CONTEXT);
    assert.notEqual(contextHash('tr', { care: { ...fixture.care, today: '2026-10-06' } }), GOLDEN_CONTEXT);
  });

  test('kayıt ya da katalog değişince karma değişir (değişiklik denetimi çalışıyor)', () => {
    const more = { ...records, measurements: [...records.measurements, { date: '2026-10-05', id: 'odi' as const, value: 17 }] };
    assert.notEqual(contextHash('en', { records: more }), GOLDEN_CONTEXT);
    assert.notEqual(contextHash('tr', { catalogTr: [{ id: 'bench', title: 'Başka ad' }, ...fixture.catalog.tr.slice(1)] }), GOLDEN_CONTEXT);
  });

  test('gösterilen özetler dile göre, karmaya girenler Türkçe', () => {
    const tr = coachFactsFor(records, { shown: fixture.catalog.tr, canonical: fixture.catalog.tr }, 'tr');
    const en = coachFactsFor(records, { shown: fixture.catalog.en, canonical: fixture.catalog.tr }, 'en');
    assert.equal(tr.shown.facts.length, en.shown.facts.length);
    assert.deepEqual(en.canonical, tr.canonical);
    assert.match(tr.shown.facts[0]!.text, /^Bitmiş 3 antrenman kaydı var\.$/);
    assert.equal(en.shown.facts[0]!.text, 'There are 3 finished workout records.');
    assert.ok(en.shown.facts.some((fact) => fact.text.includes('Barbell Bench Press')));
    assert.ok(!tr.shown.facts.some((fact) => fact.text.includes('Barbell')));
    assert.equal(en.shown.insights[0]!.title, 'Workout routine');
    assert.equal(tr.shown.insights[0]!.title, 'Antrenman düzeni');
  });

  test('süzme ve kesme: bitmemiş ve gelecek tarihli oturum yok; kamera 3, ölçüm 6 kayıt; silinmiş kamera kaydı yok', () => {
    const { shown } = coachFactsFor(records, { shown: fixture.catalog.tr, canonical: fixture.catalog.tr }, 'tr');
    const sources = shown.facts.map((fact) => fact.source);
    assert.ok(!sources.some((source) => source.includes('2026-10-03 antrenman') || source.includes('2026-10-09')));
    const measured = shown.facts.filter((fact) => fact.measurement);
    assert.equal(measured.length, 3 + 6);
    assert.ok(!measured.some((fact) => fact.source.includes('2026-10-04')));
    assert.ok(measured.every((fact) => fact.source.startsWith('Ölçüm ')));
    assert.ok(shown.facts.filter((fact) => !fact.measurement).every((fact) => !fact.source.startsWith('Ölçüm')));
    const english = coachFactsFor(records, { shown: fixture.catalog.en, canonical: fixture.catalog.tr }, 'en').shown.facts.filter((fact) => fact.measurement);
    assert.equal(english.length, 9);
    assert.ok(english.every((fact) => fact.source.startsWith('Measurement ')));
  });

  test('ölçüm bayrağı karma biçiminden çıkar', () => {
    const { canonical } = coachFactsFor(records, { shown: fixture.catalog.tr, canonical: fixture.catalog.tr }, 'tr');
    assert.ok(canonical.facts.some((fact) => fact.measurement));
    assert.ok(hashableFacts(canonical.facts).every((fact) => !('measurement' in fact)));
  });
});

describe('genel koç karması', () => {
  const snapshotsFor = (locale: Locale) => {
    const parts = coachFactsFor(records, { shown: fixture.catalog[locale], canonical: fixture.catalog.tr }, locale);
    return [
      { client: { name: 'Ada Yılmaz' }, shown: parts.shown.facts, canonical: parts.canonical.facts },
      { client: { name: 'Ece Kaya' }, shown: null, canonical: null },
    ];
  };
  const counts = { total: fixture.general.total, allowed: fixture.general.allowed };

  test('Türkçe altın karma, İngilizce aynısı', () => {
    for (const locale of LOCALES) assert.equal(generalHash(hash, snapshotsFor(locale), counts), GOLDEN_GENERAL);
  });

  test('gösterilen özetler dile göre; okunamayan danışan ve kapsam notu', () => {
    const en = generalFacts('en', snapshotsFor('en'), counts, 'shown');
    assert.equal(en[0]!.text, 'AI support is turned on for 2 of 3 clients. Health records are used only within the scope of the current health consent. The personal records of the others aren\'t used in this assessment.');
    assert.deepEqual(en.at(-1), { text: 'Ece Kaya: the record couldn\'t be read; I\'m not drawing conclusions from missing information.', clientName: 'Ece Kaya', source: 'Missing record' });
    assert.ok(en.some((fact) => fact.text.startsWith('Ada Yılmaz: ') && fact.measurement));
    const tr = generalFacts('tr', snapshotsFor('tr'), counts, 'shown');
    assert.equal(tr.at(-1)!.source, 'Eksik kayıt');
  });
});
