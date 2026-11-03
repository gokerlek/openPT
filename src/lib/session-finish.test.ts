import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, jsonText } from './github/blob.ts';
import { HEALTH_CONSENT_VERSION, type Client } from './schemas/client.ts';
import { emptySessionIndex, type FeedbackDecision, type SessionDoc, type SessionIndex } from './schemas/session.ts';
import { allowedHealth, applyPatch, BROKEN_PROPOSALS, planFinish, planPut, sessionDateFor, withPlannedDay, type FinishInput } from './session-finish.ts';
import { withDeletions } from './session-merge.ts';
import { at, DAY_A, DAY_B, PHASE, programFile, sessionDoc, sessionEntry, W1, W2, workingSet } from './testing/session-fixtures.ts';
import { OWN_DAY_A, OWN_DAY_B, OWN_ID, ownProgram } from './testing/own-fixtures.ts';

const TZ = 'Europe/Istanbul';
const NOW = new Date(at(60));

let counter = 0;
const sets = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) =>
    workingSet(`st_${(++counter).toString(36).padStart(8, '0')}`, from + index, { setIndex: index, target: { min: 8, max: 10 } }),
  );

/** Gün A: Bench 3 set + Leg Press 2 set; `done` kaçının yapıldığı. */
function dayA(done: { bench: number; leg: number }, overrides: Partial<SessionDoc> = {}): SessionDoc {
  return sessionDoc({
    entries: [
      sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets(done.bench, 1) }),
      sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', sets: sets(done.leg, 10) }),
    ],
    ...overrides,
  });
}

const noConsent: Pick<Client, 'modules' | 'consents'> = { modules: { health: { enabled: false, fields: [] } }, consents: {} };
const consent: Pick<Client, 'modules' | 'consents'> = {
  modules: { health: { enabled: true, fields: ['check_in', 'readiness'], enabledAt: '2026-09-01T00:00:00.000Z' } },
  consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['check_in', 'readiness'], at: '2026-09-02T00:00:00.000Z' } },
};

function finishInput(incoming: SessionDoc, overrides: Partial<FinishInput> = {}): FinishInput {
  return {
    stored: null,
    incoming,
    index: emptySessionIndex(),
    program: programFile(),
    healthFile: null,
    client: noConsent,
    now: NOW,
    timeZone: TZ,
    ...overrides,
  };
}

const fileOf = (plan: { files: { path: string; content: unknown }[] }, path: string) => plan.files.find((file) => file.path === path)?.content;

describe('bitiş: tek commit', () => {
  test('tamamlanan gün: seans bitti, index satırı (sha dosyanınki); program dosyası yazılmaz', () => {
    // Sunucuda 3 set var; telefon kalan 2 seti ve bitişi gönderir.
    const full = dayA({ bench: 3, leg: 2 });
    const stored = { ...full, entries: full.entries.map((entry) => (entry.id === 'e_bbbbbb' ? { ...entry, sets: [] } : entry)) };
    const incoming = { ...full, status: 'finished' as const, finishedAt: at(55), writer: W2 };
    const raw = programFile({ lastDayId: DAY_B, lastCompletedAt: '2026-09-24T18:00:00.000Z' }, { clientTargets: { r_aaaaaa: { at: 'x' } } });
    const plan = planFinish(finishInput(incoming, { stored, program: raw }));

    assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json']);
    assert.equal(plan.doc.status, 'finished');
    assert.equal(plan.doc.finishedAt, at(55));
    assert.equal(plan.doc.writer, W2);
    assert.equal(plan.doc.rotation, undefined);
    assert.equal(plan.message, 'Antrenman bitti · Gün A · 5 set');
    assert.equal(plan.doc.notices.length, 0);

    const index = fileOf(plan, 'sessions-index.json') as SessionIndex;
    assert.equal(index.items[0]?.sha, gitBlobSha(jsonText(fileOf(plan, 'sessions/s_k2m9x4qa.json'))));
    assert.equal(index.items[0]?.sets, 5);
  });

  test('yarıdan azı yapıldıysa "yarım" bildirimi', () => {
    const plan = planFinish(finishInput(dayA({ bench: 2, leg: 0 })));
    assert.equal(fileOf(plan, 'program.json'), undefined);
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['unfinished']);
    // PT'nin bildirimi yapılan ve planlanan seti söyler: "Gün A yarım bırakıldı (2/5 set)".
    assert.deepEqual(plan.doc.notices[0], { kind: 'unfinished', at: plan.doc.finishedAt, done: 2, planned: 5 });
    const row = (fileOf(plan, 'sessions-index.json') as SessionIndex).items[0];
    assert.equal(row?.unfinished, true);
    assert.deepEqual(row?.progress, { done: 2, planned: 5 });
  });

  // Faz 3 (Karar 5): dönüş yok. Eski telefon "Sıradaki antrenman" seçimini gönderebilir; okunmaz.
  test('bitiş dönüşü ilerletmez: program.json yazılmaz, seansa rotation yok', () => {
    for (const rotation of ['advance', 'keep'] as const) {
      const plan = planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { rotation, program: programFile({ lastDayId: DAY_B }) }));
      assert.equal(plan.files.some((file) => file.path === 'program.json'), false, rotation);
      assert.equal(plan.doc.rotation, undefined, rotation);
      assert.equal('rotation' in plan, false);
    }
  });

  // Gün A cumartesiye atanmış (fikstürün günü 26 Eylül 2026 cumartesi).
  const assigned = () => programFile({}, { schedule: { weekdays: [6] } });
  const dayB = (overrides: Partial<SessionDoc> = {}) =>
    sessionDoc({ entries: [sessionEntry('e_cccccc', { rowId: 'r_cccccc', sets: sets(3, 1) })], ...overrides, program: { revision: 7, dayId: DAY_B, dayName: 'Gün B', ...overrides.program } });

  test('başka program seçildi: bildirim ve planlanan programın adı (PT: "Gün A yerine Gün B yapıldı")', () => {
    const plan = planFinish(finishInput(dayB({ program: { revision: 7, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' } }), { program: assigned() }));
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['other_day']);
    assert.equal(fileOf(plan, 'program.json'), undefined);
    const row = (fileOf(plan, 'sessions-index.json') as SessionIndex).items[0];
    assert.equal(row?.otherDay, true);
    assert.equal(row?.plannedDayName, 'Gün A');
  });

  // Faz 3 (Karar 6): telefonda eskimiş plan (gece yarısı, PT'nin araya giren kaydı) yanlış bildirim üretmesin.
  test('plannedDayId sunucuda seansın tarihinden; bildirim yalnız o gün atanmış program varken', () => {
    // Cumartesi (Gün A'nın günü): telefon planlananı göndermese de sunucu yazar, bildirim çıkar.
    const saturday = planFinish(finishInput(dayB(), { program: assigned() }));
    assert.deepEqual(saturday.doc.program, { revision: 7, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' });
    assert.deepEqual(saturday.doc.notices.map((notice) => notice.kind), ['other_day']);
    // Pazar (atanmamış gün; kayıttaki tarih): telefondan gelen planlanan düşer, bildirim yok.
    const stale = { revision: 7, dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' };
    const sunday = dayB({ date: '2026-09-27', program: stale });
    const plan = planFinish(finishInput(sunday, { stored: sunday, program: assigned() }));
    assert.equal(plan.doc.date, '2026-09-27');
    assert.deepEqual(plan.doc.program, { revision: 7, dayId: DAY_B, dayName: 'Gün B' });
    assert.deepEqual(plan.doc.notices, []);
    assert.equal((fileOf(plan, 'sessions-index.json') as SessionIndex).items[0]?.otherDay, false);
    // Atamasız programda planlanan yok: bildirim yok.
    assert.deepEqual(planFinish(finishInput(dayB({ program: stale }))).doc.notices, []);
    // Planlanan program yapıldıysa ad yazılmaz.
    assert.deepEqual(planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { program: assigned() })).doc.program, {
      revision: 1,
      dayId: DAY_A,
      dayName: 'Gün A',
      plannedDayId: DAY_A,
    });
  });

  // PT antrenman sürerken evre geçirdi: seans eski evrenin programıyla başladı, yeni evrenin bugünkü ataması onun
  // planı değil; "başka program" bildirimi çıkmamalı.
  test('seansın evresi şu anki evre değilse planlanan program yok', () => {
    const stale = { revision: 7, phaseId: 'p_eskiev', dayId: DAY_B, dayName: 'Gün B', plannedDayId: DAY_A, plannedDayName: 'Gün A' };
    const plan = planFinish(finishInput(dayB({ program: stale }), { program: assigned() }));
    assert.deepEqual(plan.doc.program, { revision: 7, phaseId: 'p_eskiev', dayId: DAY_B, dayName: 'Gün B' });
    assert.deepEqual(plan.doc.notices, []);
    // Aynı evre: planlanan program yazılır, bildirim çıkar.
    const same = planFinish(finishInput(dayB({ program: { ...stale, phaseId: PHASE } }), { program: assigned() }));
    assert.equal(same.doc.program?.plannedDayId, DAY_A);
    assert.deepEqual(same.doc.notices.map((notice) => notice.kind), ['other_day']);
  });

  test('withPlannedDay: kendi programın kimliği ve adı korunur; programsız belgeye dokunulmaz', () => {
    const program = ownProgram();
    const phase = program.phases[0]!;
    const own = { ...program, phases: [{ ...phase, days: phase.days.map((day, index) => ({ ...day, ...(index === 0 ? { weekdays: [6] } : {}) })) }] };
    const doc = sessionDoc({ program: { revision: 1, dayId: OWN_DAY_B, dayName: 'Gün B', programId: OWN_ID, programName: 'Evde' } });
    assert.deepEqual(withPlannedDay(doc, own).program, {
      revision: 1,
      dayId: OWN_DAY_B,
      dayName: 'Gün B',
      plannedDayId: OWN_DAY_A,
      plannedDayName: own.phases[0]?.days[0]?.name,
      programId: OWN_ID,
      programName: 'Evde',
    });
    const bare = sessionDoc({ program: undefined });
    assert.equal(withPlannedDay(bare, own), bare);
  });

  test('kendi programda planlanan ve bildirim sunucuda değişmez', () => {
    const doc = sessionDoc({
      program: { revision: 1, dayId: OWN_DAY_B, dayName: 'Gün B', plannedDayId: OWN_DAY_A, programId: OWN_ID, programName: 'Evde' },
      entries: [sessionEntry('e_cccccc', { rowId: 'r_cccccc', sets: sets(3, 1) })],
    });
    const plan = planFinish(finishInput(doc, { program: assigned(), own: { program: ownProgram(), index: null } }));
    assert.equal(plan.doc.program?.plannedDayId, OWN_DAY_A);
    assert.deepEqual(plan.doc.notices.filter((notice) => notice.kind === 'other_day'), []);
  });

  test('okunamayan ya da olmayan program: bitiş sürer', () => {
    for (const program of [null, { bozuk: true }]) {
      const plan = planFinish(finishInput(dayA({ bench: 3, leg: 2 }), { program }));
      assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json']);
    }
  });

  test('bitiş anı: gelecekte ya da başlangıçtan önceyse sunucunun anı', () => {
    assert.equal(planFinish(finishInput({ ...dayA({ bench: 3, leg: 2 }), status: 'finished', finishedAt: at(600) })).doc.finishedAt, NOW.toISOString());
    assert.equal(planFinish(finishInput({ ...dayA({ bench: 3, leg: 2 }), status: 'finished', finishedAt: at(-5) })).doc.finishedAt, NOW.toISOString());
  });
});

describe('bitiş: sağlık ayrıntısı yalnız onayla ve yalnız health.json', () => {
  const health = { skippedRows: [{ rowId: 'r_bbbbbb', reason: 'pain' as const }], adjustReason: 'readiness' as const };
  const skippedLeg = () =>
    dayA({ bench: 3, leg: 0 }, {
      adjust: 'lighter',
      entries: [
        sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets(3, 1) }),
        sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', status: 'skipped', skip: { reason: 'other', moved: true } }),
      ],
    });

  test('onay var: health.json\'a seansın kimliğiyle; seans dosyası nötr', () => {
    const plan = planFinish(finishInput(skippedLeg(), { health, client: consent }));
    assert.equal(plan.health, 'written');
    const record = fileOf(plan, 'health.json') as { checkIns: unknown[] };
    assert.deepEqual(record.checkIns, [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', skippedRows: health.skippedRows, adjustReason: 'readiness' }]);
    const text = JSON.stringify(fileOf(plan, 'sessions/s_k2m9x4qa.json'));
    assert.equal(text.includes('pain'), false);
    assert.equal(text.includes('readiness'), false);
  });

  test('yeniden deneme çoğaltmaz: aynı seansın kaydı güncellenir', () => {
    const existing = { conditions: [], checkIns: [{ date: '2026-09-26', sessionId: 's_k2m9x4qa', adjustReason: 'pain' }], measurements: [], movementScreens: [] };
    const plan = planFinish(finishInput(skippedLeg(), { health, client: consent, healthFile: existing }));
    assert.equal((fileOf(plan, 'health.json') as { checkIns: unknown[] }).checkIns.length, 1);
  });

  test('onay yok: hiçbir şey yazılmaz; bozuk health.json üzerine yazılmaz', () => {
    const dropped = planFinish(finishInput(skippedLeg(), { health }));
    assert.equal(dropped.health, 'dropped');
    assert.equal(fileOf(dropped, 'health.json'), undefined);
    const broken = planFinish(finishInput(skippedLeg(), { health, client: consent, healthFile: { checkIns: 'x' } }));
    assert.equal(broken.health, 'broken');
    assert.equal(fileOf(broken, 'health.json'), undefined);
  });

  test('parça parça: ağrı yalnız ağrı takibi onayıyla, hazır oluşluk yalnız kendi onayıyla', () => {
    const readinessOnly = {
      modules: { health: { enabled: true, fields: ['readiness' as const] } },
      consents: { health: { granted: true, version: HEALTH_CONSENT_VERSION, fields: ['readiness' as const], at: '2026-09-02T00:00:00.000Z' } },
    };
    assert.deepEqual(allowedHealth(readinessOnly, health), { adjustReason: 'readiness' });
    assert.equal(allowedHealth(readinessOnly, { adjustReason: 'pain' }), null);
    assert.equal(allowedHealth(noConsent, health), null);
  });
});

describe('bitiş: program güncelleme (§6)', () => {
  const bench = (kg: number) =>
    sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: sets(3, 1).map((set) => ({ ...set, kg, plannedSetCount: 3, topWeightKg: 60 })) });
  const weight = (apply: boolean): FeedbackDecision => ({
    kind: 'weight_up',
    apply,
    entryId: 'e_aaaaaa',
    rowId: 'r_aaaaaa',
    dayId: DAY_A,
    exerciseId: 'bench-press',
    title: 'Bench Press',
    trackingType: 'weight_reps',
    kg: { from: 60, to: 62.5 },
  });
  const legPress: FeedbackDecision = {
    kind: 'sets',
    apply: true,
    entryId: 'e_aaaaaa',
    rowId: 'r_aaaaaa',
    dayId: DAY_A,
    exerciseId: 'bench-press',
    title: 'Bench Press',
    trackingType: 'weight_reps',
    count: { from: 3, to: 4 },
    why: '2 antrenmandır 4 set yapıldı',
  };
  const leg = () => sessionEntry('e_bbbbbb', { rowId: 'r_bbbbbb', exerciseId: 'leg-press', title: 'Leg Press', sets: sets(2, 10) });
  const incoming = (kg: number) => sessionDoc({ entries: [bench(kg), leg()], status: 'finished', finishedAt: at(55) });

  test('"Evet": danışan kaydı program yazımında (dönüş yok, ham alanlar korunur); öneri proposals.json\'a; seansa bildirimler', () => {
    const raw = programFile({ lastDayId: DAY_B, lastCompletedAt: '2026-09-24T18:00:00.000Z' }, { extra: { kept: true } });
    const plan = planFinish(finishInput(incoming(62.5), { program: raw, feedback: { answer: 'yes', items: [weight(true), legPress] } }));
    assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json', 'program.json', 'proposals.json']);
    const program = fileOf(plan, 'program.json') as { revision: number; rotation: unknown; extra: unknown; log: { kind: string; sessionId: string; changes: { text: string }[] }[] };
    assert.equal(program.revision, 7);
    assert.deepEqual(program.rotation, { lastDayId: DAY_B, lastCompletedAt: '2026-09-24T18:00:00.000Z' }, 'dönüş ilerlemez');
    assert.deepEqual(program.extra, { kept: true }, 'bilinmeyen alan düşmez');
    assert.equal(program.log[0]?.kind, 'client');
    assert.equal(program.log[0]?.sessionId, 's_k2m9x4qa');
    assert.equal(program.log[0]?.changes[0]?.text, 'Bench Press: çalışma ağırlığı 60 → 62,5 kg');
    const proposals = fileOf(plan, 'proposals.json') as { items: { kind: string; status: string }[] };
    assert.deepEqual(proposals.items.map((item) => [item.kind, item.status]), [['sets', 'pending']]);
    assert.deepEqual(plan.feedback, { direct: 1, proposals: 1, converted: 0 });
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['program_update', 'proposal']);
    const index = fileOf(plan, 'sessions-index.json') as SessionIndex;
    assert.deepEqual(index.items[0]?.notices, ['program_update', 'proposal']);
    assert.match(plan.message, /^Antrenman bitti · Gün A · 5 set · Program \(danışan\) · 1 öneri\n\n- Gün A: Bench Press: çalışma ağırlığı 60 → 62,5 kg$/);
  });

  test('"Hayır": program dosyası yazılmaz, öneri gitmez; yukarı ağırlık seansa oneOff', () => {
    const plan = planFinish(finishInput(incoming(62.5), { feedback: { answer: 'no', items: [weight(false), { ...legPress, apply: false }] } }));
    assert.deepEqual(plan.files.map((file) => file.path), ['sessions/s_k2m9x4qa.json', 'sessions-index.json']);
    assert.equal(plan.doc.entries[0]?.oneOff, true);
    const index = fileOf(plan, 'sessions-index.json') as SessionIndex;
    assert.equal(index.items[0]?.exercises[0]?.oneOff, true);
    assert.deepEqual(plan.feedback, { direct: 0, proposals: 0, converted: 0 });
  });

  test('eski telefonun dönüş seçimi okunmaz: danışanın güncellemesi yine yazılır', () => {
    const plan = planFinish(finishInput(incoming(62.5), { rotation: 'advance', feedback: { answer: 'yes', items: [weight(true)] } }));
    const program = fileOf(plan, 'program.json') as { rotation: unknown; log: unknown[] };
    assert.deepEqual(program.rotation, {});
    assert.equal(program.log.length, 1);
  });

  test('bozuk proposals.json ezilmez: öneri yazılmaz, kilo kaydı yine yazılır', () => {
    const plan = planFinish(finishInput(incoming(62.5), { proposalsFile: BROKEN_PROPOSALS, feedback: { answer: 'yes', items: [weight(true), legPress] } }));
    assert.equal(fileOf(plan, 'proposals.json'), undefined);
    assert.equal(plan.proposalsBroken, true);
    assert.deepEqual(plan.feedback, { direct: 1, proposals: 0, converted: 0 });
    assert.deepEqual(plan.doc.notices.map((notice) => notice.kind), ['program_update']);
  });
});

describe('PUT ve düzeltme hesapları', () => {
  test('tarih sunucudan: gece yarısını geçen antrenman başlangıç gününde; saçma başlangıçta sunucunun günü', () => {
    const now = new Date('2026-09-26T21:10:00.000Z'); // İstanbul 00:10 (27'si)
    assert.equal(sessionDateFor('2026-09-26T20:50:00.000Z', now, TZ), '2026-09-26');
    assert.equal(sessionDateFor('2020-01-01T10:00:00.000Z', now, TZ), '2026-09-27');
  });

  test('ilk yazma: tarih sunucudan, durum etkin; sonra kayıttaki tarih kalır', () => {
    const incoming = { ...dayA({ bench: 1, leg: 0 }), date: '1999-01-01', status: 'finished' as const, finishedAt: at(9) };
    const first = planPut(null, incoming, { now: NOW, timeZone: TZ });
    assert.deepEqual([first.doc.date, first.doc.status, first.doc.finishedAt, first.changed], ['2026-09-26', 'active', undefined, true]);
    const again = planPut(first.doc, { ...incoming, writer: W2 }, { now: NOW, timeZone: TZ });
    assert.equal(again.changed, false, 'aynı belge başka cihazdan: değişiklik yok');
    assert.equal(again.doc.writer, W2);
  });

  test('düzeltme: silme kalıcı, set ekleme silineni geri getirmez, zorluk kısmen güncellenir', () => {
    const stored = { ...withDeletions(dayA({ bench: 3, leg: 2 }), { setIds: [] }), status: 'finished' as const, finishedAt: at(50), effort: { durationMin: 50, updatedAt: at(50) } };
    const benchSets = stored.entries[0]?.sets ?? [];
    const deleted = applyPatch(stored, { writer: W1, deleteSetIds: [benchSets[0]?.id as string] }, NOW);
    assert.equal(deleted.doc.entries[0]?.sets.length, 2);
    assert.equal(deleted.message, 'Kayıt silindi');

    const phone = sessionEntry('e_aaaaaa', { rowId: 'r_aaaaaa', sets: [...benchSets, workingSet('st_zzzzzzzz', 40, { extra: true })] });
    const added = applyPatch(deleted.doc, { writer: W2, addSets: [phone] }, NOW);
    assert.deepEqual(added.doc.entries[0]?.sets.map((set) => set.id).includes(benchSets[0]?.id as string), false);
    assert.equal(added.doc.entries[0]?.sets.length, 3);
    assert.equal(added.message, 'Set eklendi (+1 set)');

    const rated = applyPatch(added.doc, { writer: W2, effort: { sessionRpe: 7 } }, NOW);
    assert.deepEqual(rated.doc.effort, { sessionRpe: 7, durationMin: 50, updatedAt: NOW.toISOString(), by: W2 });
    assert.equal(applyPatch(rated.doc, { writer: W1, effort: { sessionRpe: 7, durationMin: 50 } }, new Date(at(40))).changed, false);
  });
});
