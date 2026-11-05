/**
 * Hazır aparat havuzunun İngilizce adları (US İngilizcesi), `attachment-library.ts` ile aynı kimliklerle.
 * PT'nin kendi ya da ezdiği aparatlar bu tabloya girmez.
 */
export type AttachmentTextEn = { name: string };

export const ATTACHMENT_LIBRARY_EN: Readonly<Record<string, AttachmentTextEn>> = {
  'duz-bar': { name: 'Straight bar' },
  'lat-bari': { name: 'Lat bar' },
  'genis-cekis-bari': { name: 'Wide-grip pulldown bar' },
  'v-bar-ucgen': { name: 'V-bar (triangle)' },
  'halat': { name: 'Rope' },
  'tek-el-tutamagi': { name: 'Single-hand handle' },
  'ez-bar-aparati': { name: 'EZ bar attachment' },
  'ayak-bilekligi': { name: 'Ankle strap' },
  'mag-tutamagi': { name: 'MAG grip' },
};
