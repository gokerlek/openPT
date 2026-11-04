import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appIconSize, LOGO_SCALE, MASKABLE_SAFE_RADIUS, manifestIcons, PULSE_SCALE, PULSE_STROKE } from './brand-icon.ts';

describe('marka simgesi', () => {
  test('yalnız bilinen boylar: iPhone 180, Android 192 ve 512', () => {
    assert.equal(appIconSize('180'), 180);
    assert.equal(appIconSize('192'), 192);
    assert.equal(appIconSize('512'), 512);
    for (const bad of [null, '', '64', '180.0', '1024', 'abc']) assert.equal(appIconSize(bad), null, String(bad));
  });

  test('manifest simgeleri: iki boy, ikisi de hem "any" hem "maskable"', () => {
    assert.deepEqual(manifestIcons(), [
      { src: '/api/brand/app-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/brand/app-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/api/brand/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/brand/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });

  test('maskelenebilir simgede işaret güvenli dairenin içinde (yarıçap simgenin %40ı)', () => {
    // Logo kare bir kutuya sığdırılır: en uzak noktası köşe, merkeze uzaklığı yarım köşegen.
    assert.ok((LOGO_SCALE * Math.SQRT2) / 2 <= MASKABLE_SAFE_RADIUS, 'logo köşesi güvenli alanın dışında');
    // Nabız çizgisi yatay ve ortalı: en uzak noktası uçlar (yarım genişlik + yuvarlak uç).
    assert.ok(PULSE_SCALE / 2 + PULSE_STROKE / 2 <= MASKABLE_SAFE_RADIUS, 'nabız çizgisinin ucu güvenli alanın dışında');
  });
});
