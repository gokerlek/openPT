import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachClientOf, coachPage, coachSelection, consumeAutoReview, type CoachRequest } from './coach-context.ts';
import { coachHighlights } from './coach-highlights.ts';
import { DEFAULT_COACH_PREFERENCES } from './coach-contract.ts';
import { answerCoach } from './coach-engine.ts';
import { EMPTY_CARE } from '../constraint-filter.ts';
test('PT context follows the actual client route; general pages never infer a client', () => {
  assert.equal(coachClientOf('/dashboard/clients/c_zmrbywaz/measurements'), 'c_zmrbywaz');
  assert.equal(coachClientOf('/dashboard/clients'), null);
  assert.equal(coachClientOf('/dashboard/clients/new'), null);
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/measurements'), 'measurements');
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/measurements/new'), 'measurements');
  // Hareket ve kamera ölçümü Sağlık'ın parçası: panel başlığı "Sağlık" der, "Ölçümler" değil.
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/measurements/camera'), 'health');
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/screening'), 'health');
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/screening/new'), 'health');
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/constraints'), 'health');
  assert.equal(coachPage('/me/olcum'), 'health');
  assert.equal(coachPage('/me/saglik'), 'health');
  assert.equal(coachPage('/me/antrenman'), 'workout');
  assert.equal(coachPage('/me/ayarlar'), 'settings');
  assert.equal(coachPage('/dashboard/clients/c_zmrbywaz/coach/drafts/d_abc'), 'program');
  assert.equal(coachPage('/me/programlar/ai/x'), 'program');
  assert.equal(coachPage('/me/ilerleme/rekorlar'), 'progress');
});
test('each proactive preference controls its own recorded-event message', () => {
  const event = { id: 'test-session', date: '2026-10-05', dayName: 'Gün A', sets: 4 };
  assert.equal(coachHighlights(event, DEFAULT_COACH_PREFERENCES).length, 3);
  assert.deepEqual(coachHighlights(event, { comments: false, celebrations: false, suggestions: false }), []);
  const result = coachHighlights(event, { comments: true, celebrations: false, suggestions: false });
  assert.equal(result.length, 1); assert.match(result[0]!.text, /4 çalışma seti/);
  assert.ok(!result[0]!.text.includes('kalori'));
});
test('general coach locally focuses on the named client and never builds a collective program', () => {
  const context = { facts: [{ clientName: 'Ada', text: 'Ada: 3 antrenman', source: 'Ada kayıt' }, { clientName: 'Ece', text: 'Ece: 7 antrenman', source: 'Ece kayıt' }], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: true, today: '', global: true };
  const answer = answerCoach({ intent: 'progress', exerciseIds: [] }, context, 'Ada nasıl gidiyor?');
  assert.match(answer.answer, /3 antrenman/); assert.ok(!answer.answer.includes('Ece'));
  assert.match(answerCoach({ intent: 'plan', exerciseIds: [] }, context).answer, /belirli bir danışan/);
});
test('ambiguous first names request clarification instead of attributing another client’s records', () => {
  const context = { facts: [{ clientName: 'Gizem Ada', text: '3 antrenman', source: 'Kayıt' }, { clientName: 'Gizem Ece', text: '7 antrenman', source: 'Kayıt' }], exercises: [], care: EMPTY_CARE, existingExerciseIds: [], healthUnavailable: true, today: '', global: true };
  const result = answerCoach({ intent: 'progress', exerciseIds: [] }, context, 'Gizem nasıl?');
  assert.match(result.answer, /birden fazla/); assert.ok(!result.answer.includes('3 antrenman'));
});
test('a PT open forcing a client on a general page selects that client without the general/client toggle', () => {
  const request: CoachRequest = { n: 1, path: '/dashboard', detail: { clientId: 'c_zmrbywaz', autoReview: true } };
  const result = coachSelection({ role: 'pt', routeClient: null, generalPath: null, pathname: '/dashboard', request });
  assert.equal(result.selected, 'c_zmrbywaz'); assert.equal(result.general, false);
  assert.equal(result.toggle, false); assert.equal(result.autoReview, true); assert.equal(result.page, 'overview');
});
test('a plain open after a forced one falls back to the route client or the general coach', () => {
  const plain: CoachRequest = { n: 2, path: '/dashboard', detail: {} };
  const general = coachSelection({ role: 'pt', routeClient: null, generalPath: null, pathname: '/dashboard', request: plain });
  assert.equal(general.selected, null); assert.equal(general.general, true); assert.equal(general.autoReview, false);
  const onClient: CoachRequest = { n: 3, path: '/dashboard/clients/c_ecebcdef/program', detail: {} };
  const route = coachSelection({ role: 'pt', routeClient: 'c_ecebcdef', generalPath: null, pathname: onClient.path, request: onClient });
  assert.equal(route.selected, 'c_ecebcdef'); assert.equal(route.toggle, true); assert.equal(route.initialTab, undefined);
  // "Tüm danışanları değerlendir" bu sayfada genel koça geçirir.
  assert.equal(coachSelection({ role: 'pt', routeClient: 'c_ecebcdef', generalPath: onClient.path, pathname: onClient.path, request: onClient }).selected, null);
});
test('the opening context belongs to its page: navigating away while open follows the route again', () => {
  const request: CoachRequest = { n: 1, path: '/dashboard', detail: { clientId: 'c_zmrbywaz', tab: 'program', autoReview: true } };
  const elsewhere = coachSelection({ role: 'pt', routeClient: 'c_ecebcdef', generalPath: null, pathname: '/dashboard/clients/c_ecebcdef', request });
  assert.equal(elsewhere.selected, 'c_ecebcdef'); assert.equal(elsewhere.autoReview, false); assert.equal(elsewhere.initialTab, undefined);
});
test('the client role always gets its own records, whatever clientId the open carries', () => {
  const request: CoachRequest = { n: 1, path: '/me/ilerleme', detail: { clientId: 'c_zmrbywaz', autoReview: true } };
  const result = coachSelection({ role: 'client', routeClient: 'c_ownrecord', generalPath: '/me/ilerleme', pathname: '/me/ilerleme', request });
  assert.equal(result.selected, 'c_ownrecord'); assert.equal(result.general, false); assert.equal(result.toggle, false);
  assert.equal(result.autoReview, true); assert.equal(result.page, 'progress');
});
test('auto review is consumed once per open without remounting the panel', () => {
  const request: CoachRequest = { n: 4, path: '/dashboard', detail: { clientId: 'c_zmrbywaz', tab: 'review', autoReview: true } };
  const input = { role: 'pt' as const, routeClient: null, generalPath: null, pathname: '/dashboard' };
  const before = coachSelection({ ...input, request }), consumed = consumeAutoReview(request);
  const after = coachSelection({ ...input, request: consumed });
  assert.equal(before.autoReview, true); assert.equal(after.autoReview, false);
  assert.equal(after.key, before.key); assert.equal(after.selected, 'c_zmrbywaz'); assert.equal(after.initialTab, 'review');
  assert.equal(consumed.n, request.n); assert.equal(consumed.path, request.path);
  // Panelden başka sayfaya gidip geri dönünce bağlam yine uygulanır ama değerlendirme yinelenmez.
  assert.equal(coachSelection({ ...input, pathname: '/dashboard/clients/c_zmrbywaz', routeClient: 'c_zmrbywaz', request: consumed }).autoReview, false);
  assert.equal(coachSelection({ ...input, request: consumed }).autoReview, false);
  assert.equal(consumeAutoReview(consumed), consumed);
});
