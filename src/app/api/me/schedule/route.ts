import { NextResponse } from 'next/server';
import { sessionRouteDeps } from '@/lib/session-files';
import { origin } from '@/lib/urls';
import { scheduleRoute } from '@/lib/workout-routes';

/**
 * Danışanın antrenman günleri (tasarım §2.11): eski telefonun Bugün'deki ve Ayarlar'daki "Günlerini değiştir"i
 * `{ weekdays, programId? }`. Faz 3'te danışan günleri değiştirmez (Karar 3): PT programında günleri antrenör atar,
 * kendi programda günler programın formundadır. Uç hiçbir şey yazmaz; 409 ve telefonun göstereceği metinle döner.
 * Kurallar `workout-routes.ts`'te. Yalnız bu siteden ve JSON'la; kimlik yalnız oturumdan.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await scheduleRoute(await sessionRouteDeps(), request.headers, origin(request), body);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
