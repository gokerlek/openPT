import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest, type Locale } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { langConfig } from '@/i18n/valibot';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { failureOf } from '@/lib/route-failure';
import { templateSaveSchema, type Template } from '@/lib/schemas/template';
import { readPtSession } from '@/lib/session';
import { normalizeTemplate, randomId } from '@/lib/template-plan';
import { readTemplateFile, writeTemplate } from '@/lib/templates';

function failed(error: unknown, fallback: string, locale: Locale) {
  const { message, status } = failureOf(error, fallback, locale);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Yeni şablon ya da (kimlikle) güncelleme. Egzersiz ve cihaz kimlikleri kütüphaneye göre
 * denetlenir. Düzenleyici yüklediği sürümü (`baseSha`) gönderir: dosya o arada başka
 * yerde değiştiyse 412 döner ve kayıt yapılmaz (PT'nin değişiklikleri kaybolmasın).
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  const session = await readPtSession();
  if (session?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const parsed = v.safeParse(templateSaveSchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: t.checkInput, fields }, { status: 400 });
  }

  const { id: requestedId, baseSha, name, description, blocks, sharedWithClients } = parsed.output;
  /** Bayrak yalnız açıkken yazılır; göndermeyen eski sekme kayıttakini korur (kendi-program.md §3.8). */
  const flag = (stored?: boolean) => ((sharedWithClients ?? stored) ? { sharedWithClients: true as const } : {});
  try {
    const [exercises, devices] = await Promise.all([listExercises(undefined, locale), listDevices(undefined, locale)]);
    const normalized = normalizeTemplate(
      { blocks },
      { exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])), deviceIds: new Set(devices.map((device) => device.id)) },
      undefined,
      locale,
    );
    if (Object.keys(normalized.errors).length > 0) {
      return NextResponse.json({ error: t.checkInput, fields: normalized.errors }, { status: 400 });
    }

    const now = new Date().toISOString();
    if (requestedId) {
      const stored = await readTemplateFile(requestedId, locale);
      if (!stored) return NextResponse.json({ error: t.templateNotFoundMaybeDeleted }, { status: 404 });
      if (baseSha && baseSha !== stored.sha) {
        return NextResponse.json(
          { error: t.templateStale },
          { status: 412 },
        );
      }
      // Okunamayan dosyanın üzerine yazmak onu onarır; oluşturma tarihi yoksa bugün.
      const template: Template = {
        id: requestedId,
        name,
        description,
        blocks: normalized.blocks,
        ...flag(stored.template?.sharedWithClients),
        createdAt: stored.template?.createdAt ?? now,
        updatedAt: now,
      };
      const { sha } = await writeTemplate(template, { sha: stored.sha, message: t.templateUpdated(name) });
      return NextResponse.json({ id: requestedId, sha });
    }

    // Kimlik rastgele; çok düşük ihtimalle var olan bir dosyaya denk gelirse GitHub reddeder
    // (409), istemci bir kez yeniden dener ve yeni kimlik alır.
    const id = randomId('t', 8, new Set());
    const template: Template = { id, name, description, blocks: normalized.blocks, ...flag(), createdAt: now, updatedAt: now };
    const { sha } = await writeTemplate(template, { message: t.templateAdded(name) });
    return NextResponse.json({ id, sha }, { status: 201 });
  } catch (error) {
    return failed(error, t.templateSaveFailed, locale);
  }
}
