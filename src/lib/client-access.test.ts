import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { checkInvite, hashInviteCode, newClientId, newInvite } from './client-access.ts';
import {
  accessState,
  canRecordHealth,
  clientSessionValid,
  consentVersionOf,
  hasNewDeviceCode,
  formatInviteCode,
  healthConsentState,
  healthFieldState,
  hasHealthSection,
  healthScopeGrows,
  indexWithStatus,
  INVITE_MAX_ATTEMPTS,
  INVITE_TTL_DAYS,
  inviteStatus,
  nextHealthModule,
  normalizeInviteCode,
  outdatedHealthFields,
  revokedInvite,
} from './client-status.ts';
import {
  CLIENT_ID_PATTERN,
  clientFormSchema,
  clientSaveSchema,
  clientSchema,
  HEALTH_CONSENT_VERSION,
  HEALTH_FIELD_VERSIONS,
  heartRateOf,
  trainingOf,
  type Client,
  type ClientIndexEntry,
} from './schemas/client.ts';

const SIR = 'test-sirri';
const simdi = new Date('2026-09-23T10:00:00.000Z');

describe('danışan kimliği', () => {
  test('repo adına uygun biçimde ve her seferinde farklı', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientId()));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, CLIENT_ID_PATTERN);
  });
});

describe('davet kodu', () => {
  test('kod saklanmaz, yalnız anahtarlı özeti; süre 7 gün', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    assert.match(code, /^\d{8}$/);
    assert.equal(JSON.stringify(invite).includes(code), false);
    assert.equal(invite.codeHash, hashInviteCode(SIR, 'c_abc12345', code));
    assert.equal(new Date(invite.expiresAt).getTime() - simdi.getTime(), INVITE_TTL_DAYS * 86_400_000);
  });

  test('özet danışana ve sırra bağlı: aynı kod başka danışanda ya da başka sırla tutmaz', () => {
    assert.notEqual(hashInviteCode(SIR, 'c_aaaaaaaa', '12345678'), hashInviteCode(SIR, 'c_bbbbbbbb', '12345678'));
    assert.notEqual(hashInviteCode(SIR, 'c_aaaaaaaa', '12345678'), hashInviteCode('baska', 'c_aaaaaaaa', '12345678'));
  });

  test('doğru kod açar; boşluklu ve tireli yazım da kabul', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    const ctx = { secret: SIR, clientId: 'c_abc12345', now: simdi };
    assert.deepEqual(checkInvite(invite, { ...ctx, code }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: formatInviteCode(code) }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: `${code.slice(0, 4)}-${code.slice(4)}` }), { ok: true });
    assert.deepEqual(checkInvite(invite, { ...ctx, code: '00000000' === code ? '11111111' : '00000000' }), {
      ok: false,
      reason: 'invalid',
    });
  });

  test('başka danışanın kimliğiyle aynı kod açmaz', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    assert.deepEqual(checkInvite(invite, { secret: SIR, clientId: 'c_zzz99999', code, now: simdi }), {
      ok: false,
      reason: 'invalid',
    });
  });

  test('kullanılmış, süresi dolmuş ya da kilitli davet doğru kodla da açılmaz', () => {
    const { invite, code } = newInvite(SIR, 'c_abc12345', simdi);
    const ctx = { secret: SIR, clientId: 'c_abc12345', code };
    const sonra = new Date(simdi.getTime() + (INVITE_TTL_DAYS + 1) * 86_400_000);

    assert.deepEqual(checkInvite({ ...invite, used: true }, { ...ctx, now: simdi }), { ok: false, reason: 'used' });
    assert.deepEqual(checkInvite(invite, { ...ctx, now: sonra }), { ok: false, reason: 'expired' });
    assert.deepEqual(checkInvite({ ...invite, attempts: INVITE_MAX_ATTEMPTS }, { ...ctx, now: simdi }), {
      ok: false,
      reason: 'locked',
    });
    assert.deepEqual(checkInvite(null, { ...ctx, now: simdi }), { ok: false, reason: 'none' });
  });

  test('durum sırası: kullanıldı > kilitli > süresi doldu > bekliyor', () => {
    const { invite } = newInvite(SIR, 'c_abc12345', simdi);
    const sonra = new Date(simdi.getTime() + (INVITE_TTL_DAYS + 1) * 86_400_000);
    assert.equal(inviteStatus(invite, simdi), 'pending');
    assert.equal(inviteStatus(invite, sonra), 'expired');
    assert.equal(inviteStatus({ ...invite, attempts: INVITE_MAX_ATTEMPTS }, sonra), 'locked');
    assert.equal(inviteStatus({ ...invite, used: true, attempts: INVITE_MAX_ATTEMPTS }, sonra), 'used');
    assert.equal(normalizeInviteCode(' 1234 - 5678 '), '12345678');
  });
});

describe('giriş durumu', () => {
  const saat = (hh: string) => `2026-09-23T${hh}:00:00.000Z`;
  const davet = (createdAt: string, extra: Partial<ReturnType<typeof newInvite>['invite']> = {}) => ({
    ...newInvite(SIR, 'c_abc12345', new Date(createdAt)).invite,
    ...extra,
  });
  const an = new Date(saat('12'));

  test('katılmış danışana yeni cihaz kodu üretilince "katıldı" kalır, kod ayrıca bildirilir', () => {
    const access = { joinedAt: saat('09'), lastJoinAt: saat('09') };
    const yeni = davet(saat('10'));
    assert.equal(accessState(access, yeni, an), 'joined');
    assert.equal(hasNewDeviceCode(access, yeni, an), true);
    // Kullanılmış eski davet yeni kod sayılmaz.
    assert.equal(hasNewDeviceCode(access, davet(saat('08'), { used: true }), an), false);
  });

  test('erişim kapatılınca "kapalı", yeniden davet edilince davetin durumu', () => {
    const access = { joinedAt: saat('08'), lastJoinAt: saat('08'), revokedAt: saat('09') };
    assert.equal(accessState(access, null, an), 'revoked');
    assert.equal(accessState(access, davet(saat('07')), an), 'revoked');
    assert.equal(accessState(access, davet(saat('10')), an), 'pending');
    // Kapatıldıktan sonra yeniden girdi.
    assert.equal(accessState({ ...access, lastJoinAt: saat('11') }, davet(saat('10'), { used: true }), an), 'joined');
  });

  test('hiç girmemiş danışanda davetin durumu; eski kayıtta kullanılmış davet "katıldı" demek', () => {
    assert.equal(accessState({}, null, an), 'none');
    assert.equal(accessState({}, davet(saat('10')), an), 'pending');
    assert.equal(accessState({}, davet(saat('10'), { used: true }), an), 'used');
  });

  test('kapatmadan önce (ya da aynı anda) üretilmiş davet geçersiz; sonra üretilen geçerli', () => {
    const access = { revokedAt: saat('09') };
    assert.equal(revokedInvite(access, davet(saat('08'))), true);
    assert.equal(revokedInvite(access, davet(saat('09'))), true);
    assert.equal(revokedInvite(access, davet(saat('10'))), false);
    assert.equal(revokedInvite({}, davet(saat('08'))), false);
  });

  test('PT rozeti "kapalı" diyorsa sunucu da o daveti reddeder (silinememiş olsa da)', () => {
    // Kapatma: kuşak arttı, davet dosyası silinemedi ve "bekliyor" görünüyor.
    for (const access of [{ revokedAt: saat('09') }, { joinedAt: saat('08'), lastJoinAt: saat('08'), revokedAt: saat('09') }]) {
      for (const createdAt of [saat('07'), saat('09'), saat('10')]) {
        const invite = davet(createdAt);
        assert.equal(inviteStatus(invite, an), 'pending');
        assert.equal(accessState(access, invite, an) === 'revoked', revokedInvite(access, invite), createdAt);
      }
    }
  });
});

describe('danışan oturumu', () => {
  const kayit = (extra: Partial<Pick<Client, 'status' | 'access'>> = {}) => ({
    status: 'active' as const,
    access: { version: 2 },
    ...extra,
  });

  test('erişimi kapatılmış, arşivlenmiş ya da silinmiş danışanın oturumu geçersiz; duraklatılmış girer', () => {
    assert.equal(clientSessionValid(kayit(), 2), true);
    assert.equal(clientSessionValid(kayit({ status: 'paused' }), 2), true);
    // "Erişimi kapat": kuşak arttı, eski çerezdeki kuşak tutmaz.
    assert.equal(clientSessionValid(kayit(), 1), false);
    assert.equal(clientSessionValid(kayit({ status: 'archived' }), 2), false);
    // Silindi: kayıt yok.
    assert.equal(clientSessionValid(null, 2), false);
  });
});

describe('danışan listesi', () => {
  const liste: ClientIndexEntry[] = [
    { id: 'c_aaaaaaaa', status: 'active' },
    { id: 'c_bbbbbbbb', status: 'paused' },
  ];

  test('satırın durumu farklıysa yalnız o satır güncellenir', () => {
    assert.deepEqual(indexWithStatus(liste, 'c_bbbbbbbb', 'active'), [
      { id: 'c_aaaaaaaa', status: 'active' },
      { id: 'c_bbbbbbbb', status: 'active' },
    ]);
  });

  test('kayıt önceki denemede yazılıp liste yazılamadıysa, aynı formu yeniden kaydetmek listeyi düzeltir', () => {
    // Kayıt zaten "arşivde" (eski ve yeni durumu aynı), liste hâlâ "aktif": karar listedeki satıra göre.
    assert.deepEqual(indexWithStatus(liste, 'c_aaaaaaaa', 'archived'), [
      { id: 'c_aaaaaaaa', status: 'archived' },
      { id: 'c_bbbbbbbb', status: 'paused' },
    ]);
  });

  test('satır zaten o durumdaysa ya da listede yoksa yazılmaz', () => {
    assert.equal(indexWithStatus(liste, 'c_aaaaaaaa', 'active'), null);
    assert.equal(indexWithStatus(liste, 'c_zzzzzzzz', 'archived'), null);
  });
});

describe('sağlık onayı', () => {
  const danisan = (health: Client['modules']['health'], consent?: Client['consents']['health']) => ({
    modules: { health },
    consents: consent ? { health: consent } : {},
  });
  const onay = (fields: Client['modules']['health']['fields'], extra: Partial<NonNullable<Client['consents']['health']>> = {}) => ({
    granted: true,
    version: HEALTH_CONSENT_VERSION,
    fields,
    at: simdi.toISOString(),
    ...extra,
  });

  test('modül kapalıysa hiçbir şey tutulmaz, onay olsa da', () => {
    const kapali = danisan({ enabled: false, fields: ['check_in'] }, onay(['check_in']));
    assert.equal(healthConsentState(kapali), 'off');
    assert.equal(canRecordHealth(kapali, 'check_in'), false);
  });

  test('modül açık ama onay yoksa kayıt yok', () => {
    const bekliyor = danisan({ enabled: true, fields: ['check_in'] });
    assert.equal(healthConsentState(bekliyor), 'pending');
    assert.equal(canRecordHealth(bekliyor, 'check_in'), false);
    assert.equal(healthConsentState(danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in'], { granted: false }))), 'declined');
  });

  test('onay yalnız kapsadığı parçalar için geçerli; yeni parça yeniden onay ister', () => {
    const acik = danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in', 'measurements']));
    assert.equal(healthConsentState(acik), 'granted');
    assert.equal(canRecordHealth(acik, 'check_in'), true);
    // Onaylanmış ama PT modülde açmamış: tutulmaz.
    assert.equal(canRecordHealth(acik, 'measurements'), false);

    // Onay parça başınadır: kapsanmayan parça yeniden sorulur, kapsanan sürer (taban anı yoksa).
    const genisledi = danisan({ enabled: true, fields: ['check_in', 'screening'] }, onay(['check_in']));
    assert.equal(healthConsentState(genisledi), 'outdated');
    assert.equal(canRecordHealth(genisledi, 'check_in'), true);
    assert.equal(canRecordHealth(genisledi, 'screening'), false);
    assert.deepEqual(outdatedHealthFields(genisledi), ['screening']);
    // PT'nin kaydı kapsamı genişletince taban anı yenilenir: bütün onay yeniden sorulur.
    const tabanli = danisan({ enabled: true, fields: ['check_in', 'screening'], enabledAt: an(10) }, onay(['check_in'], { at: an(5) }));
    assert.equal(canRecordHealth(tabanli, 'check_in'), false);
  });

  test('Sağlık bölümü yalnız kısıt ya da tarama kaydı yazılabilirken var; ölçüm ya da ağrı takibi tek başına açmaz', () => {
    assert.equal(hasHealthSection(danisan({ enabled: true, fields: ['conditions'] }, onay(['conditions']))), true);
    assert.equal(hasHealthSection(danisan({ enabled: true, fields: ['screening'] }, onay(['screening']))), true);
    assert.equal(hasHealthSection(danisan({ enabled: true, fields: ['measurements', 'check_in'] }, onay(['measurements', 'check_in']))), false);
    // Modülde seçili ama onay yok, ya da onay kapsamıyor: bölüm yok.
    assert.equal(hasHealthSection(danisan({ enabled: true, fields: ['conditions', 'screening'] })), false);
    assert.equal(hasHealthSection(danisan({ enabled: true, fields: ['conditions', 'screening'] }, onay(['check_in']))), false);
    assert.equal(hasHealthSection(danisan({ enabled: false, fields: [] }, onay(['conditions', 'screening']))), false);
  });

  test('onay metni değişince eski onay güncel değil', () => {
    const eski = danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in'], { version: '2025-01' }));
    assert.equal(healthConsentState(eski), 'outdated');
  });

  test('sürüm parça başına: kısıtların sürümü artınca yalnız kısıtlar yeniden sorulur, ağrı takibi sürer', () => {
    const eski = danisan({ enabled: true, fields: ['conditions', 'check_in', 'measurements'] }, onay(['conditions', 'check_in', 'measurements'], { version: '2026-09' }));
    assert.equal(healthFieldState(eski, 'conditions'), 'outdated');
    assert.equal(canRecordHealth(eski, 'check_in'), true);
    assert.equal(canRecordHealth(eski, 'measurements'), true);
    assert.deepEqual(outdatedHealthFields(eski), ['conditions']);
    assert.equal(healthConsentState(eski), 'outdated');
    // Parça başına sürüm yazılmışsa o okunur; bozuk biçim kapsamaz.
    const parcali = danisan(
      { enabled: true, fields: ['conditions', 'check_in'] },
      onay(['conditions', 'check_in'], { version: '2026-09', versions: { conditions: '2026-10', check_in: '2026-09' } }),
    );
    assert.equal(healthConsentState(parcali), 'granted');
    assert.equal(consentVersionOf({ version: '2026-09' }, 'screening'), '2026-09');
    const bozuk = danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in'], { version: 'sonra' }));
    assert.equal(canRecordHealth(bozuk, 'check_in'), false);
    // Güncel onay bütün parçaları kapsar.
    assert.equal(healthConsentState(danisan({ enabled: true, fields: ['conditions', 'screening'] }, onay(['conditions', 'screening']))), 'granted');
    assert.equal(HEALTH_FIELD_VERSIONS.conditions > HEALTH_FIELD_VERSIONS.check_in, true);
  });

  const an = (dakika: number) => new Date(simdi.getTime() + dakika * 60_000).toISOString();

  test('modül son açılışından (enabledAt) önce verilmiş onay güncel değil; sonra verilen geçerli', () => {
    const modul = { enabled: true, fields: ['check_in' as const], enabledAt: an(10) };
    assert.equal(healthConsentState(danisan(modul, onay(['check_in'], { at: an(5) }))), 'outdated');
    assert.equal(canRecordHealth(danisan(modul, onay(['check_in'], { at: an(5) })), 'check_in'), false);
    assert.equal(healthConsentState(danisan(modul, onay(['check_in'], { at: an(10) }))), 'granted');
    assert.equal(healthConsentState(danisan(modul, onay(['check_in'], { at: an(15) }))), 'granted');
    // Eski kayıt: açılış anı yok, eski kural.
    assert.equal(healthConsentState(danisan({ enabled: true, fields: ['check_in'] }, onay(['check_in']))), 'granted');
  });

  test('kapat → aç: taban anı yenilenir, eski onay yeniden sorulur; kapalıyken onay silinmez', () => {
    const acik = nextHealthModule(null, { enabled: true, fields: ['conditions', 'check_in'] }, an(0));
    const kapali = nextHealthModule(acik, { enabled: false, fields: [] }, an(20));
    assert.deepEqual(kapali, { enabled: false, fields: [] });
    const yeniden = nextHealthModule(kapali, { enabled: true, fields: ['conditions', 'check_in'] }, an(30));
    assert.equal(yeniden.enabledAt, an(30));
    const onayli = onay(['conditions', 'check_in'], { at: an(10) });
    assert.equal(healthConsentState(danisan(kapali, onayli)), 'off');
    assert.equal(healthConsentState(danisan(yeniden, onayli)), 'outdated');
    assert.equal(healthConsentState(danisan(yeniden, onay(['conditions', 'check_in'], { at: an(31) }))), 'granted');
  });

  test('kapsam: parça çıkarmak daraltır (taban korunur), çıkarılan parçayı geri eklemek genişletir', () => {
    const acik = nextHealthModule(null, { enabled: true, fields: ['conditions', 'check_in'] }, an(0));
    const dar = nextHealthModule(acik, { enabled: true, fields: ['conditions'] }, an(20));
    assert.equal(dar.enabledAt, an(0));
    assert.equal(healthScopeGrows(dar, ['conditions', 'check_in']), true);
    const genis = nextHealthModule(dar, { enabled: true, fields: ['conditions', 'check_in'] }, an(30));
    assert.equal(genis.enabledAt, an(30));
    // Aynı kapsamla kayıt tabanı değiştirmez; eski kayıtta hiç yoksa uydurulmaz.
    assert.equal(nextHealthModule(genis, { enabled: true, fields: ['check_in', 'conditions'] }, an(40)).enabledAt, an(30));
    assert.deepEqual(nextHealthModule({ enabled: true, fields: ['conditions'] }, { enabled: true, fields: ['conditions'] }, an(40)), {
      enabled: true,
      fields: ['conditions'],
    });
  });
});

describe('danışan formu', () => {
  const temel = { name: 'Ayşe Demir', note: '', status: 'active' as const, healthEnabled: false, healthFields: [] };

  test('modül kapalıyken parça seçmek gerekmez', () => {
    assert.equal(v.safeParse(clientFormSchema, temel).success, true);
  });

  test('modül açıksa en az bir parça; hata parça alanına düşer', () => {
    const sonuc = v.safeParse(clientFormSchema, { ...temel, healthEnabled: true });
    assert.equal(sonuc.success, false);
    assert.deepEqual(
      sonuc.issues?.map((issue) => issue.path?.map((segment) => segment.key).join('.')),
      ['healthFields'],
    );
  });


  test('ad kırpılır ve boş olamaz', () => {
    assert.equal(v.safeParse(clientFormSchema, { ...temel, name: '   ' }).success, false);
    const sonuc = v.safeParse(clientFormSchema, { ...temel, name: '  Ayşe  ' });
    assert.equal(sonuc.success && sonuc.output.name, 'Ayşe');
  });

  test('antrenman geçmişi isteğe bağlı: yeni / 6 ay+ / 1 yıl+ (açık soru 4)', () => {
    for (const trainingExperience of ['new', 'six_months', 'one_year']) {
      assert.equal(v.safeParse(clientFormSchema, { ...temel, trainingExperience }).success, true);
    }
    assert.equal(v.safeParse(clientFormSchema, { ...temel, trainingExperience: 'iki_yil' }).success, false);
    assert.deepEqual(trainingOf({ trainingExperience: 'one_year' }), { training: { experience: 'one_year' } });
    assert.deepEqual(trainingOf({}, { experience: 'six_months' }), { training: { experience: 'six_months' } });
    assert.deepEqual(trainingOf({ trainingExperience: 'new' }, { experience: 'six_months' }), { training: { experience: 'new' } });
    assert.deepEqual(trainingOf({}), {});
  });

  test('nabız sınırları isteğe bağlı: ikisi birlikte ya da ikisi de boş (otomatik); 60–220, toparlanma uyarıdan düşük', () => {
    const parse = (heartRecovery: string, heartAlert: string) => v.safeParse(clientFormSchema, { ...temel, heartRecovery, heartAlert });
    const paths = (heartRecovery: string, heartAlert: string) =>
      parse(heartRecovery, heartAlert).issues?.map((issue) => issue.path?.map((segment) => segment.key).join('.'));
    const empty = parse('', ' ');
    assert.deepEqual(empty.success && [empty.output.heartRecovery, empty.output.heartAlert], [null, null]);
    const set = parse(' 115 ', '165');
    assert.deepEqual(set.success && [set.output.heartRecovery, set.output.heartAlert], [115, 165]);
    assert.deepEqual(paths('120', ''), ['heartAlert']);
    assert.deepEqual(paths('', '170'), ['heartRecovery']);
    assert.deepEqual(paths('170', '120'), ['heartRecovery']);
    assert.deepEqual(paths('150', '150'), ['heartRecovery']);
    assert.deepEqual(paths('59', '170'), ['heartRecovery']);
    assert.deepEqual(paths('120', '221'), ['heartAlert']);
    assert.deepEqual(paths('12a', '170'), ['heartRecovery']);
    assert.deepEqual(paths('120.5', '170'), ['heartRecovery']);
  });

  test('nabız sınırı yalnız rakamlardan oluşan tam sayı: "0x78", "1e2", "+120", "12 0" kabul edilmez', () => {
    for (const text of ['0x78', '1e2', '+120', '-120', '12 0', '120,0', '١٢٠']) {
      const result = v.safeParse(clientFormSchema, { ...temel, heartRecovery: text, heartAlert: '170' });
      assert.deepEqual(
        result.issues?.map((issue) => [issue.path?.map((segment) => segment.key).join('.'), issue.message]),
        [['heartRecovery', 'Yalnız rakam girilmeli.']],
        text,
      );
    }
    const result = v.safeParse(clientFormSchema, { ...temel, heartRecovery: '0120', heartAlert: '170' });
    assert.equal(result.success && result.output.heartRecovery, 120);
  });

  test('kayıt ucu: nabız sınırı sayı, boşaltılmış (null) ya da hiç yok (eski istemci)', () => {
    const save = (extra: object) => v.safeParse(clientSaveSchema, { ...temel, ...extra }).success;
    assert.equal(save({}), true);
    assert.equal(save({ heartRecovery: null, heartAlert: null }), true);
    assert.equal(save({ heartRecovery: 115, heartAlert: 165 }), true);
    assert.equal(save({ heartRecovery: 115 }), false);
    assert.equal(save({ heartRecovery: 165, heartAlert: 115 }), false);
    assert.equal(save({ heartRecovery: '115', heartAlert: '165' }), false);
    // Sunucu metin hiç almaz: "0x78" gibi biçimler kayda ulaşamaz; kesirli ya da sonsuz sayı da yok.
    assert.equal(save({ heartRecovery: '0x78', heartAlert: 170 }), false);
    assert.equal(save({ heartRecovery: 120.5, heartAlert: 170 }), false);
    assert.equal(save({ heartRecovery: Number.POSITIVE_INFINITY, heartAlert: 170 }), false);
  });
});

describe('danışan kaydı: nabız sınırları', () => {
  const kayit = {
    id: 'c_abc12345',
    name: 'Ayşe Demir',
    createdAt: simdi.toISOString(),
    status: 'active',
    modules: { health: { enabled: false, fields: [] } },
    consents: {},
    access: { version: 1 },
    visibleTo: [],
  };

  test('eski kayıt (alan yok) olduğu gibi okunur; alan varsa aralıkta olmalı', () => {
    const eski = v.safeParse(clientSchema, kayit);
    assert.equal(eski.success && eski.output.heartRate, undefined);
    assert.equal(v.safeParse(clientSchema, { ...kayit, heartRate: { recovery: 110, alert: 160 } }).success, true);
    assert.equal(v.safeParse(clientSchema, { ...kayit, heartRate: { recovery: 110, alert: 400 } }).success, false);
  });

  test('formdan kayda: sayılar yazılır, boşaltılınca alan düşer, formda gelmezse kayıttaki kalır', () => {
    const current = { recovery: 110, alert: 160 };
    assert.deepEqual(heartRateOf({ heartRecovery: 115, heartAlert: 165 }, current), { heartRate: { recovery: 115, alert: 165 } });
    assert.deepEqual(heartRateOf({ heartRecovery: null, heartAlert: null }, current), {});
    assert.deepEqual(heartRateOf({}, current), { heartRate: current });
    assert.deepEqual(heartRateOf({}), {});
  });
});
