import * as v from 'valibot';
import { messageOf } from '../i18n/errors.ts';
import { DEFAULT_LOCALE, intlLocale, type Locale } from '../i18n/locale.ts';
import { ptProgramMessages } from '../i18n/messages/pt-program/index.ts';
import { langConfig } from '../i18n/valibot.ts';
import { templateSchema, type Template } from './schemas/template.ts';

/**
 * Şablon dosyalarının okunması ve önbelleği — saf (GitHub ve `server-only` yok; `templates.ts` okumayı verir).
 *
 * Liste, dosyaların içerik özetine (blob sha) göre bellekte tutulur: sha içeriğin kendisinden çıktığı için önbellek hiç
 * eskimez. Geçerli şablon ayrıştırılmış hâliyle, okunamayan dosya YAPI olarak (ham içerik) tutulur: sorun metni okuyanın
 * dilinde her istekte yeniden üretilir, dil karışmaz ve bozuk dosya her listede GitHub'dan yeniden okunmaz.
 */

export type TemplateFile =
  | { sha: string; template: Template; name: string; problem: null }
  /** Okunamayan dosya (bozuk JSON, şemaya uymuyor, kimlik dosya adıyla uyuşmuyor). */
  | { sha: string; template: null; name: string | null; problem: string; id: string };

/** Depodan okunan ham dosya: içerik ya da JSON olarak okunamadığı (`unreadable`). */
export type RawTemplate = { id: string; sha: string; content: unknown; unreadable?: false } | { id: string; sha: string; unreadable: true };

const CACHE_LIMIT = 300;
const READ_CHUNK = 8;

/** Ham dosyayı okuyanın dilinde şablona ya da sorunlu dosyaya çevirir. */
export function renderTemplate(raw: RawTemplate, locale: Locale = DEFAULT_LOCALE): TemplateFile {
  const t = ptProgramMessages(locale).templatesLib;
  const { id, sha } = raw;
  if (raw.unreadable) return { sha, template: null, name: null, id, problem: t.unreadable };
  const content = raw.content;
  const fields = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};
  const name = typeof fields.name === 'string' ? fields.name : null;
  const parsed = v.safeParse(templateSchema, content, langConfig(locale));
  if (!parsed.success) {
    const issue = parsed.issues[0];
    return { sha, template: null, name, id, problem: `${v.getDotPath(issue) ?? t.fileFallback}: ${issue.message}` };
  }
  if (parsed.output.id !== id) return { sha, template: null, name, id, problem: t.idMismatch };
  return { sha, template: parsed.output, name: parsed.output.name, problem: null };
}

type Cached = { kind: 'valid'; file: TemplateFile } | { kind: 'broken'; raw: RawTemplate };

export type TemplateCache = {
  get: (sha: string) => Cached | undefined;
  remember: (raw: RawTemplate, rendered: TemplateFile) => void;
};

/** İçerik özeti → okunmuş dosya. Ekleme sırasıyla en eskisi düşer. */
export function createTemplateCache(limit = CACHE_LIMIT): TemplateCache {
  const entries = new Map<string, Cached>();
  return {
    get: (sha) => entries.get(sha),
    remember(raw, rendered) {
      entries.delete(raw.sha);
      entries.set(raw.sha, rendered.template ? { kind: 'valid', file: rendered } : { kind: 'broken', raw });
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

function sortKey(file: TemplateFile): string {
  return file.template ? file.template.name : (file.name ?? file.id);
}

/**
 * Bütün şablonlar: geçerliler ada göre (dile göre sıralı), okunamayanlar sonda. Önbellekte olmayanlar 8'erli
 * okunur. Tek dosyanın okuma hatası listeyi düşürmez (okunamayan olarak görünür, önbelleğe girmez).
 */
export async function resolveTemplates(
  entries: readonly { name: string; sha: string }[],
  cache: TemplateCache,
  load: (id: string) => Promise<RawTemplate | null>,
  locale: Locale = DEFAULT_LOCALE,
): Promise<TemplateFile[]> {
  const files = new Map<string, TemplateFile>();
  const misses = entries.filter((entry) => {
    const cached = cache.get(entry.sha);
    if (cached) files.set(entry.name, cached.kind === 'valid' ? cached.file : renderTemplate(cached.raw, locale));
    return !cached;
  });

  for (let start = 0; start < misses.length; start += READ_CHUNK) {
    await Promise.all(
      misses.slice(start, start + READ_CHUNK).map(async (entry) => {
        const id = entry.name.replace(/\.json$/, '');
        try {
          const raw = await load(id);
          if (!raw) return;
          const rendered = renderTemplate(raw, locale);
          // Okunan sürümün sha'sıyla saklanır: liste ile okuma arasında değiştiyse bir sonraki liste yeniden okur.
          cache.remember(raw, rendered);
          files.set(entry.name, rendered);
        } catch (error) {
          const message = messageOf(error, locale) ?? ptProgramMessages(locale).templatesLib.readFailed;
          files.set(entry.name, { sha: entry.sha, template: null, name: null, id, problem: message });
        }
      }),
    );
  }

  const collator = intlLocale(locale);
  const all = entries.flatMap((entry) => {
    const file = files.get(entry.name);
    return file ? [file] : [];
  });
  return [
    ...all.filter((file) => file.template).sort((a, b) => sortKey(a).localeCompare(sortKey(b), collator)),
    ...all.filter((file) => !file.template).sort((a, b) => sortKey(a).localeCompare(sortKey(b), collator)),
  ];
}
