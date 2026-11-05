import 'server-only';
import * as v from 'valibot';
import { messageOf, type Localizable, type LocalizedText } from '../i18n/errors';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale';
import { healthMessages } from '../i18n/messages/health';
import { readClient } from './clients';
import { ConstraintError } from './constraints';
import { clientRepoName, GithubError } from './github/client';
import { readJson, writeJson } from './github/files';
import { dropNotices } from './notices-store';
import { prepareForWrite } from './health-view';
import {
  addMeasurements,
  healthLock,
  healthLockInfo,
  removeMeasurementDate,
  replaceMeasurements,
  type HealthLock,
  type MeasurementValue,
} from './measurement-log';
import type { Sex } from './measurements';
import type { Client, HealthField } from './schemas/client';
import { healthRecordSchema, type HealthRecord } from './schemas/health';

/**
 * Danışanın sağlık kaydı — `client-<id>` repo'sundaki `health.json` (SPEC §3, §4).
 *
 * Sağlık verisi özel nitelikli kişisel veridir: YALNIZ danışanın kendi repo'suna yazılır,
 * uygulama repo'suna, günlüğe ya da commit mesajına hiçbir değer girmez (mesajlar genel).
 * Her yazma, danışan kaydını taze okuyup modül ve o parçanın onayını yeniden denetler: arayüzdeki
 * kontrol tek başına güvence değildir. Dosya ilk yazmada boş ama geçerli bir kayıtla oluşur.
 */

export const HEALTH_PATH = 'health.json';

/**
 * Sağlık kaydının GitHub hatası, kullanıcıya giden metni okuyanın dilinde (`messageOf`). `GithubError` olarak
 * yakalanır; `.message` Türkçe kalır (günlük ve testler).
 */
class HealthError extends GithubError implements Localizable {
  readonly text: LocalizedText;
  constructor(text: LocalizedText, status: number) {
    super(text(DEFAULT_LOCALE), status);
    this.text = text;
  }

  localized(locale: Locale): string {
    return this.text(locale);
  }
}

/** Sağlık uçlarının dile göre GitHub hatası (`messageOf` okuyanın dilinde verir). */
export function healthError(text: LocalizedText, status: number): GithubError {
  return new HealthError(text, status);
}

function recordText(locale: Locale) {
  return healthMessages(locale).record;
}

export function emptyHealthRecord(): HealthRecord {
  return { version: 2, checkIns: [], measurements: [] };
}

/**
 * Kayıt ve `sha`, dosya yoksa null. Bozuk dosya 500 fırlatır: üzerine boş kayıt yazılıp
 * veri kaybolmasın, PT sorunu görsün.
 */
export async function readHealth(clientId: string): Promise<{ record: HealthRecord; sha: string } | null> {
  const stored = await readJson<unknown>(clientRepoName(clientId), HEALTH_PATH);
  if (!stored) return null;
  const parsed = v.safeParse(healthRecordSchema, stored.content);
  if (!parsed.success) throw new HealthError((locale) => recordText(locale).malformed(HEALTH_PATH), 500);
  return { record: parsed.output, sha: stored.sha };
}

export type HealthPartView =
  | { state: 'ok'; record: HealthRecord }
  /** Modül kapalı ya da parçanın onayı yok: kayıt okunmaz bile. */
  | { state: 'locked'; lock: HealthLock }
  /** `health.json` bozuk: ekranda sorun olarak gösterilir. */
  | { state: 'broken'; problem: string };
export type MeasurementsView = HealthPartView;

/**
 * PT ekranları için bir sağlık parçası. Kilitliyken dosyaya hiç gidilmez: onay yokken sağlık verisi
 * işlenmez (gösterim de işlemedir). Dosya yoksa boş kayıt.
 */
export async function loadHealthPart(client: Client, field: HealthField, locale: Locale = DEFAULT_LOCALE): Promise<HealthPartView> {
  const lock = healthLock(client, field);
  if (lock) return { state: 'locked', lock };
  try {
    const stored = await readHealth(client.id);
    return { state: 'ok', record: stored?.record ?? emptyHealthRecord() };
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return { state: 'broken', problem: messageOf(error, locale) ?? error.message };
    throw error;
  }
}

export function loadMeasurements(client: Client, locale: Locale = DEFAULT_LOCALE): Promise<MeasurementsView> {
  return loadHealthPart(client, 'measurements', locale);
}

/**
 * Onaylı parçalar birlikte (bir okuma): Genel'in özeti, program düzenleyicisi. Hiçbir parça onaylı değilse ya da
 * dosya okunamıyorsa null; parçaların dilimini çağıran alır.
 */
export async function readHealthIfAllowed(client: Client, fields: readonly HealthField[]): Promise<HealthRecord | null> {
  if (fields.every((field) => healthLock(client, field))) return null;
  try {
    return (await readHealth(client.id))?.record ?? emptyHealthRecord();
  } catch (error) {
    if (error instanceof GithubError && error.status === 500) return null;
    throw error;
  }
}

/** Parça bu danışan için yazılamıyorsa nedeniyle birlikte 403. */
function assertAllowed(client: Pick<Client, 'modules' | 'consents'>, field: HealthField): void {
  const lock = healthLock(client, field);
  if (lock) throw new HealthError((locale) => recordText(locale).cannotSave(healthLockInfo(field, lock, locale).title), 403);
}

/**
 * Oku → değiştir → yaz, `sha` kilidiyle, parçanın onayı taze kayıttan denetlenerek. Çakışmada (409) taze okuyup
 * bir kez yeniden dener: değişiklikler kimliğe ya da güne bağlı olduğu için başka bir yazmanın üzerine yeniden
 * uygulamak güvenli (kısıtın kendi çakışması `baseUpdatedAt` ile 412). Saf eylemin kural hatası (`ConstraintError`)
 * durumuyla `GithubError`'a döner. Değişiklik yoksa yazılmaz.
 */
export async function updateHealth(
  clientId: string,
  field: HealthField | readonly HealthField[],
  change: (record: HealthRecord) => HealthRecord,
  message: string,
): Promise<HealthRecord> {
  const stored = await readClient(clientId);
  if (!stored) throw new HealthError((locale) => recordText(locale).clientNotFound, 404);
  const fields: readonly HealthField[] = typeof field === 'string' ? [field] : field;
  for (const item of fields) assertAllowed(stored.client, item);

  const repo = clientRepoName(clientId);
  for (let attempt = 0; ; attempt += 1) {
    const current = await readHealth(clientId);
    const base = prepareForWrite(current?.record ?? emptyHealthRecord(), fields.includes('conditions') ? 'conditions' : fields[0]!);
    let next: HealthRecord;
    try {
      next = change(base);
    } catch (error) {
      if (error instanceof ConstraintError) throw new HealthError(error.text, error.status);
      throw error;
    }
    // Eylem kaydı değiştirmediyse yazılmaz (yalnız biçim çevirisi için commit atılmaz).
    if (current && next === base) return current.record;
    try {
      await writeJson(repo, HEALTH_PATH, next, { sha: current?.sha, message });
      // Genel bakış'ın "Dikkat gerektirenler"i ve bildirimleri sağlık kaydından: yeniden türetilsin.
      dropNotices(clientId);
      return next;
    } catch (error) {
      if (attempt === 0 && error instanceof GithubError && error.status === 409) continue;
      throw error;
    }
  }
}

/** Cinsiyet yalnız bilinmiyorsa yazılır; sonradan başka bir değer gelse de korunur. */
function withSex(record: HealthRecord, sex: Sex | undefined): HealthRecord {
  return sex && !record.sex ? { ...record, sex } : record;
}

/** Güne ölçüm ekler; aynı gün aynı ölçümün aynı tarafı varsa yenisi yerine geçer. */
export async function addMeasurementDay(
  clientId: string,
  input: { date: string; values: readonly MeasurementValue[]; sex?: Sex | undefined },
): Promise<void> {
  await updateHealth(
    clientId,
    'measurements',
    (record) => ({ ...withSex(record, input.sex), measurements: addMeasurements(record.measurements, input.date, input.values) }),
    'Ölçüm kaydedildi',
  );
}

/** Günün değerlerini verilenlerle değiştirir. O gün kayıt yoksa 404. */
export async function replaceMeasurementDay(
  clientId: string,
  input: { date: string; values: readonly MeasurementValue[]; sex?: Sex | undefined },
): Promise<void> {
  await updateHealth(
    clientId,
    'measurements',
    (record) => {
      if (!record.measurements.some((entry) => entry.date === input.date)) {
        throw new HealthError((locale) => recordText(locale).measurementMissing, 404);
      }
      return { ...withSex(record, input.sex), measurements: replaceMeasurements(record.measurements, input.date, input.values) };
    },
    'Ölçüm güncellendi',
  );
}

/** Günün bütün değerlerini siler. O gün kayıt yoksa 404. */
export async function deleteMeasurementDay(clientId: string, date: string): Promise<void> {
  await updateHealth(
    clientId,
    'measurements',
    (record) => {
      if (!record.measurements.some((entry) => entry.date === date)) {
        throw new HealthError((locale) => recordText(locale).measurementAlreadyDeleted, 404);
      }
      return { ...record, measurements: removeMeasurementDate(record.measurements, date) };
    },
    'Ölçüm silindi',
  );
}
