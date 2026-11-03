import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { postGuard } from '@/lib/client-auth-routes';
import { readClient } from '@/lib/clients';
import { seededRandom } from '@/lib/demo-history';
import { DEMO_PROGRAM_SEED, demoProgramRecord } from '@/lib/demo-program';
import { demoSeedGate, seedRequestSchema } from '@/lib/demo-seed';
import { listExercises } from '@/lib/exercises';
import { GithubError } from '@/lib/github/client';
import { programIdSource } from '@/lib/program-plan';
import { readProgramFile, writeProgramFile } from '@/lib/programs';
import { readPtSession } from '@/lib/session';
import { origin } from '@/lib/urls';

/**
 * YALNIZ GELİŞTİRME: bir deneme danışanına güne atanmış üç programlı PT programını kurar (Faz 3, kullanıcının kararı
 * 6): Salı "Alt vücut", Perşembe "Üst vücut", Pazar "Tüm vücut" (`demo-program.ts`). Bugün'ün atanmış günü, hafta
 * şeridi, "Değiştir" ve PT'nin "başka program" bildirimi gerçek bir danışan beklemeden gözden geçirilebilsin diye.
 *
 * Üretimde bu uç YOKTUR — `NODE_ENV === 'production'` iken 404 döner (`/api/dev/seed-history` gibi). PT oturumu ister
 * ve yalnız adı "Test " ile başlayan danışana yazar (`demoSeedGate`): ad kapısı yüzünden gerçek danışanın programına
 * hiçbir koşulda yazamaz. Yalnız bu siteden ve JSON'la (`postGuard`: köken + `application/json`).
 *
 * - `POST { clientId }` → danışanın `program.json`'u taze kayıtla (revision 1) değiştirilir: danışanın eski gün katmanı
 *   (`clientSchedule`), hedefleri (`clientTargets`) ve dönüş (`rotation`) gider; `schedule` atamaların birleşimi.
 *   Kimlikler sabit tohumdan: yeniden çağırmak aynı gün kimliklerini yazar. Dosya bozuksa da sha'sıyla üzerine yazılır.
 *   Yanıt `{ status: 'written', days: [{ name, weekdays }] }`.
 */

const production = () => process.env.NODE_ENV === 'production';

/** Gövde: yalnız danışanın kimliği (`seed-history`'nin kalıbıyla). */
const seedProgramRequestSchema = v.object({ clientId: seedRequestSchema.entries.clientId });

function blocked(status: number, error: string): NextResponse {
  if (production()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (production()) return new NextResponse(null, { status: 404 });
  const gate = demoSeedGate({ production: false, pt: (await readPtSession())?.role === 'pt' });
  if (!gate.ok) return blocked(gate.status, gate.error);
  const cross = postGuard(request.headers, origin(request));
  if (cross) return blocked(cross.status, String(cross.body.error));

  const parsed = v.safeParse(seedProgramRequestSchema, await request.json().catch(() => null));
  if (!parsed.success) return blocked(400, 'İstek geçersiz: clientId (c_…).');
  const { clientId } = parsed.output;

  try {
    // Ad kapısı kayıt okunduktan sonra: danışan yoksa 404, adı "Test " ile başlamıyorsa 403 (gerçek danışan).
    const stored = await readClient(clientId);
    const clientGate = demoSeedGate({ production: false, pt: true, client: stored?.client ?? null });
    if (!clientGate.ok || !stored) return blocked(clientGate.ok ? 404 : clientGate.status, clientGate.ok ? 'Danışan bulunamadı.' : clientGate.error);
    const client = stored.client;

    const library = new Map((await listExercises()).map((exercise) => [exercise.id, exercise]));
    const record = demoProgramRecord(library, programIdSource([], seededRandom(DEMO_PROGRAM_SEED).bytes), new Date());
    if ('missing' in record) return blocked(409, `Kütüphanede yok: ${record.missing.join(', ')}`);

    // Var olan dosyanın sha'sı (bozuk JSON'da da döner): taze kayıt onun üstüne yazılır.
    const prior = await readProgramFile(client.id);
    await writeProgramFile(client.id, record.program, { sha: prior?.sha, message: 'Deneme programı (geliştirme)' });
    console.error(`[deneme] ${client.id}: program`);
    const days = (record.program.phases[0]?.days ?? []).map((day) => ({ name: day.name, weekdays: day.weekdays ?? [] }));
    return NextResponse.json({ status: 'written', days });
  } catch (error) {
    const failure = error instanceof GithubError ? error : null;
    console.error(`[deneme] ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
    return blocked(failure?.status ?? 502, failure?.message ?? 'Deneme programı yazılamadı.');
  }
}
