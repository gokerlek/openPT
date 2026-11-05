import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { langConfig } from '@/i18n/valibot';
import { failureOf } from '@/lib/route-failure';
import { switchPhase } from '@/lib/programs';
import { clientIdSchema } from '@/lib/schemas/client';
import { programPhaseSwitchSchema } from '@/lib/schemas/program';
import { readPtSession } from '@/lib/session';

/**
 * PT onaylı evre geçişi (program sayfasındaki "Sonraki evreye geç"). Geçiş program
 * geçmişine yazılır; sayfa yüklendikten sonra program değiştiyse (revision ya da silinip
 * yeniden oluşturulduysa oluşturulma anı tutmuyorsa) 412 döner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptProgramMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  const { id } = await params;
  if (!v.is(clientIdSchema, id)) return NextResponse.json({ error: t.clientNotFound }, { status: 404 });

  const parsed = v.safeParse(programPhaseSwitchSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) return NextResponse.json({ error: t.invalidRequest }, { status: 400 });

  try {
    const { phaseId, baseRevision, baseCreatedAt } = parsed.output;
    const result = await switchPhase(id, phaseId, { revision: baseRevision, createdAt: baseCreatedAt }, locale);
    switch (result.status) {
      case 'saved':
        return NextResponse.json({ revision: result.revision });
      case 'unchanged':
        return NextResponse.json({ revision: result.revision, unchanged: true });
      case 'unknown':
        return NextResponse.json({ error: t.phaseNotFound }, { status: 400 });
      case 'missing':
        return NextResponse.json({ error: t.programNotFoundMaybeDeleted }, { status: 404 });
      case 'stale':
        return NextResponse.json(
          { error: t.phaseStale },
          { status: 412 },
        );
    }
  } catch (error) {
    const { message, status } = failureOf(error, t.phaseSwitchFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}
