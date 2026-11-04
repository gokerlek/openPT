import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { appIconSize, LOGO_SCALE, PULSE_BOX_HEIGHT, PULSE_SCALE, PULSE_STROKE_WIDTH, PULSE_VIEWBOX_WIDTH } from '@/lib/brand-icon';
import { readAppConfig } from '@/lib/config';
import { appRepo } from '@/lib/github/client';
import { readBinary } from '@/lib/github/files';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/**
 * Kurulum simgesi: marka logosu veya mevcut nabız işareti, maskelenebilir güvenli alan içinde (`lib/brand-icon.ts`).
 * 192 ve 512 iki manifest'te (danışan ve panel), 180 iPhone ana ekranında (`apple-touch-icon`).
 */
export async function GET(request: Request) {
  const pixels = appIconSize(new URL(request.url).searchParams.get('size'));
  if (!pixels) return new Response(null, { status: 400 });
  const config = await readAppConfig();
  const type = config.logo ? TYPES[config.logo.split('.').pop() ?? ''] : undefined;
  const logo = config.logo && type ? await readBinary(appRepo(), config.logo).catch(() => null) : null;
  const mark = logo
    ? createElement('img', {
        src: `data:${type};base64,${Buffer.from(logo.bytes).toString('base64')}`,
        width: pixels * LOGO_SCALE,
        height: pixels * LOGO_SCALE,
        style: { objectFit: 'contain' },
      })
    : createElement('svg', { width: pixels * PULSE_SCALE, height: pixels * PULSE_BOX_HEIGHT, viewBox: `0 0 ${PULSE_VIEWBOX_WIDTH} 40`, fill: 'none' },
        createElement('path', {
          d: 'M0 20h78l8-13 10 26 9-19 7 6h128',
          stroke: config.accent ?? '#c4f000', strokeWidth: PULSE_STROKE_WIDTH, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
  return new ImageResponse(
    createElement('div', {
      style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717' },
    }, mark),
    { width: pixels, height: pixels, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
