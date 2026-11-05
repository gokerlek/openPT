import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { commonMessages } from '@/i18n/messages/common';
import { localeFromRequest } from '@/i18n/locale';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { langConfig } from '@/i18n/valibot';
import { listDevices } from '@/lib/devices';
import { listExercises } from '@/lib/exercises';
import { failureOf } from '@/lib/route-failure';
import { dayToTemplate } from '@/lib/program-plan';
import { storedBlocksSchema, templateNameSchema, type Template } from '@/lib/schemas/template';
import { readPtSession } from '@/lib/session';
import { normalizeTemplate, randomId } from '@/lib/template-plan';
import { writeTemplate } from '@/lib/templates';

/** Bloklar eski biçimde de gelebilir (eski sekme): yeni biçime çevrilir. */
const bodySchema = v.object({ name: templateNameSchema, blocks: storedBlocksSchema });

/**
 * Program gününü yeni şablon olarak kaydeder. Şablonda kişisel veri olmamalı: satır
 * notları sunucuda da atılır, commit mesajında danışana dair bir şey geçmez. Bloklar
 * düzenleyiciden gelir (kaydedilmemiş gün de olur): PT ne görüyorsa o kaydedilir.
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const t = ptLibraryMessages(locale).apiRoutes;
  if ((await readPtSession())?.role !== 'pt') return NextResponse.json({ error: commonMessages(locale).errors.status[403] }, { status: 403 });

  const parsed = v.safeParse(bodySchema, await request.json().catch(() => null), langConfig(locale));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.issues) {
      const key = issue.path?.map((segment) => String(segment.key as PropertyKey)).join('.');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: t.checkInput, fields }, { status: 400 });
  }

  const { template } = dayToTemplate({ blocks: parsed.output.blocks }, parsed.output.name);
  try {
    const [exercises, devices] = await Promise.all([listExercises(undefined, locale), listDevices(undefined, locale)]);
    const normalized = normalizeTemplate(template, {
      exercises: new Map(exercises.map((exercise) => [exercise.id, exercise])),
      deviceIds: new Set(devices.map((device) => device.id)),
    }, undefined, locale);
    if (Object.keys(normalized.errors).length > 0) {
      return NextResponse.json(
        { error: t.dayLibraryMissing, fields: normalized.errors },
        { status: 400 },
      );
    }

    // Kimlik rastgele; çok düşük ihtimalle var olan bir dosyaya denk gelirse GitHub reddeder
    // (409), istemci bir kez yeniden dener ve yeni kimlik alır.
    const now = new Date().toISOString();
    const id = randomId('t', 8, new Set());
    const saved: Template = { id, name: template.name, description: '', blocks: normalized.blocks, createdAt: now, updatedAt: now };
    await writeTemplate(saved, { message: t.templateAdded(template.name) });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const { message, status } = failureOf(error, t.templateSaveFailed, locale);
    return NextResponse.json({ error: message }, { status });
  }
}
