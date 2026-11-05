import { NextResponse } from 'next/server';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { failureOf } from '@/lib/route-failure';
import { TEMPLATE_ID_PATTERN } from '@/lib/schemas/template';
import { readPtSession } from '@/lib/session';
import { deleteTemplateFile, readTemplateFile } from '@/lib/templates';

/**
 * Şablon dosyasını siler (okunamayan dosya da silinebilir). Git geçmişinde kaydı durur.
 * Kimlik kalıba uymuyorsa GitHub'a hiç gidilmez.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const { id } = await params;
  if (!TEMPLATE_ID_PATTERN.test(id)) return NextResponse.json({ error: t.templateNotFound }, { status: 404 });
  try {
    const stored = await readTemplateFile(id, locale);
    if (!stored) return NextResponse.json({ error: t.templateNotFound }, { status: 404 });
    await deleteTemplateFile(id, stored.sha, t.templateDeleted(stored.name ?? id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = failureOf(error, t.templateDeleteFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}
