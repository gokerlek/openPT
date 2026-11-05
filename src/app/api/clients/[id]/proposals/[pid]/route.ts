import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptProgramMessages } from '@/i18n/messages/pt-program';
import { langConfig } from '@/i18n/valibot';
import { failureOf } from '@/lib/route-failure';
import { PROPOSAL_ID_PATTERN, proposalActionSchema } from '@/lib/proposals';
import { approveProposal, declineProposal } from '@/lib/proposals-store';
import { clientIdSchema } from '@/lib/schemas/client';
import { readPtSession } from '@/lib/session';

/**
 * PT: danışanın önerisine karar (tasarım §6.4). `{ action: 'approve', sessionId }` öneriyi programa uygular
 * (`saveProgram` yolu: fark, revision +1, log `edit`; program ve öneri tek commit'te); önerinin dayandığı hâl
 * değiştiyse program değişmez, öneri `stale` olur (409). `{ action: 'decline', sessionId, note? }` yalnız öneriyi
 * reddeder. `sessionId` PT'nin gördüğü sürüm: öneri o arada başka bir seansla güncellendiyse karar uygulanmaz (409).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptProgramMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });
  const { id, pid } = await params;
  if (!v.is(clientIdSchema, id) || !PROPOSAL_ID_PATTERN.test(pid)) return NextResponse.json({ error: t.proposalNotFound }, { status: 404 });
  const parsed = v.safeParse(proposalActionSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) return NextResponse.json({ error: t.invalidRequest }, { status: 400 });

  try {
    if (parsed.output.action === 'decline') {
      const result = await declineProposal(id, pid, parsed.output.sessionId, parsed.output.note, locale);
      switch (result.status) {
        case 'declined':
          return NextResponse.json({ status: 'declined' });
        case 'missing':
          return NextResponse.json({ error: t.proposalNotFound }, { status: 404 });
        case 'decided':
          return NextResponse.json({ error: t.proposalDecided }, { status: 409 });
        case 'changed':
          return NextResponse.json({ error: t.proposalChanged }, { status: 409 });
      }
    }
    const result = await approveProposal(id, pid, parsed.output.sessionId, locale);
    switch (result.status) {
      case 'approved':
        return NextResponse.json({ status: 'approved', revision: result.revision });
      case 'stale':
        return NextResponse.json({ error: t.proposalStale(result.reason), stale: true }, { status: 409 });
      case 'missing':
        return NextResponse.json({ error: t.proposalNotFound }, { status: 404 });
      case 'decided':
        return NextResponse.json({ error: t.proposalDecided }, { status: 409 });
      case 'changed':
        return NextResponse.json({ error: t.proposalChanged }, { status: 409 });
      case 'no_program':
        return NextResponse.json({ error: t.programNotFoundMaybeDeleted }, { status: 404 });
      case 'invalid_program':
        return NextResponse.json({ error: t.programUnreadable }, { status: 409 });
    }
  } catch (error) {
    const { message, status } = failureOf(error, t.decisionSaveFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}
