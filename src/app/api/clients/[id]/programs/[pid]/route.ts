import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { langConfig } from '@/i18n/valibot';
import { readClient } from '@/lib/clients';
import { failureOf } from '@/lib/route-failure';
import { saveResponse } from '@/lib/own-program-routes';
import { isOwnProgramId } from '@/lib/own-programs';
import { ptSaveOwnProgram } from '@/lib/own-programs-store';
import { clientIdSchema } from '@/lib/schemas/client';
import { ownProgramSaveSchema } from '@/lib/schemas/own-program';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın paylaştığı programı kaydeder (`docs/design/kendi-program.md` §3.5, §4). Dosya dalın ucunda okunur;
 * paylaşılmamışsa 403 (index'teki `shared` gösterimdir, karar dosyadan). Commit aynı uçla; dal o arada ilerlediyse
 * yeniden okunur ve paylaşım yeniden denetlenir. Ad, paylaşım, kimlik, geçmiş, rotasyon ve (günler değişmediyse)
 * günler kayıttan gelir; geçmişe `by: "pt"`, danışana bildirim (index `ptEditedAt`). 412 eski sürüm, 404 silinmiş.
 * `pid` kalıba uymuyorsa yol kurulmadan 404.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptProgramMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  const { id, pid } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: t.clientNotFound }, { status: 404 });
  if (!isOwnProgramId(pid)) return NextResponse.json({ error: t.programNotFound }, { status: 404 });

  const parsed = v.safeParse(ownProgramSaveSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: t.checkInput, fields }, { status: 400 });
  }
  // PT program oluşturamaz: yalnız danışanın paylaştığı var olan programı kaydeder.
  if (parsed.output.baseRevision === null) return NextResponse.json({ error: t.programNotFound }, { status: 404 });

  try {
    if (!(await readClient(id))) return NextResponse.json({ error: t.clientNotFound }, { status: 404 });
    const result = saveResponse(await ptSaveOwnProgram(id, pid, parsed.output, locale), 'pt', locale);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const { message, status } = failureOf(error, t.programSaveFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}
