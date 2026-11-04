import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chromeIntentUrl,
  INSTALL_SNOOZE_DAYS,
  installGuide,
  isSnoozed,
  safariUrl,
  snoozeUntil,
  type InstallEnv,
} from './install-guide.ts';

/** Gerçek tarayıcıların kullanıcı aracısı (user agent) dizeleri. */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPadOS 13'ten beri iPad Safari masaüstü (Macintosh) dizesi gönderir; ayırt eden dokunma noktası sayısı.
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; tr_TR; tr; scale=3.00; 1170x2532; 618012365)',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/612345678;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/tr_TR;FBOP/5]',
  // Uygulamaların gömülü tarayıcısı (WKWebView): "Version/" ve "Safari/" yok.
  iphoneWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240705.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; tr_TR; 612345678)',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.98;]',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

function env(userAgent: string, rest: Partial<InstallEnv> = {}): InstallEnv {
  return { userAgent, maxTouchPoints: 0, standalone: false, canPrompt: false, ...rest };
}

describe('yükleme yardımcısı: hangi anlatım', () => {
  test('uygulama olarak açıksa (yüklü) hiçbir anlatım yok; tarayıcı ne olursa olsun', () => {
    assert.equal(installGuide(env(UA.iphoneSafari, { maxTouchPoints: 5, standalone: true })), 'installed');
    assert.equal(installGuide(env(UA.androidChrome, { maxTouchPoints: 5, standalone: true, canPrompt: true })), 'installed');
    assert.equal(installGuide(env(UA.desktopChrome, { standalone: true })), 'installed');
  });

  test('tarayıcı yükleme penceresini veriyorsa (beforeinstallprompt) düğme', () => {
    assert.equal(installGuide(env(UA.androidChrome, { maxTouchPoints: 5, canPrompt: true })), 'prompt');
    assert.equal(installGuide(env(UA.desktopChrome, { canPrompt: true })), 'prompt');
    assert.equal(installGuide(env(UA.androidSamsung, { maxTouchPoints: 5, canPrompt: true })), 'prompt');
  });

  test('iPhone Safari ve masaüstü dizesi gönderen iPad Safari: Paylaş → Ana Ekrana Ekle', () => {
    assert.equal(installGuide(env(UA.iphoneSafari, { maxTouchPoints: 5 })), 'ios-safari');
    assert.equal(installGuide(env(UA.ipadDesktop, { maxTouchPoints: 5 })), 'ios-safari');
  });

  test('dokunmatik olmayan Mac Safari iPad sayılmaz', () => {
    assert.equal(installGuide(env(UA.macSafari, { maxTouchPoints: 0 })), 'menu');
  });

  test("iPhone'da Safari dışı tarayıcı ve uygulama içi tarayıcı: Safari'de aç", () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneInstagram, UA.iphoneFacebook, UA.iphoneWebView]) {
      assert.equal(installGuide(env(ua, { maxTouchPoints: 5 })), 'ios-other', ua);
    }
  });

  test("Android'de uygulama içi tarayıcı: Chrome'da aç", () => {
    for (const ua of [UA.androidWebView, UA.androidInstagram, UA.androidFacebook]) {
      assert.equal(installGuide(env(ua, { maxTouchPoints: 5 })), 'android-in-app', ua);
    }
  });

  test('pencere gelmemişse ya da tarayıcı vermiyorsa: menüden ekleme anlatımı', () => {
    assert.equal(installGuide(env(UA.androidChrome, { maxTouchPoints: 5 })), 'menu');
    assert.equal(installGuide(env(UA.androidSamsung, { maxTouchPoints: 5 })), 'menu');
    assert.equal(installGuide(env(UA.androidFirefox, { maxTouchPoints: 5 })), 'menu');
    assert.equal(installGuide(env(UA.desktopFirefox)), 'menu');
    assert.equal(installGuide(env('')), 'menu');
  });
});

describe('"Şimdi değil": 14 gün gizli (o cihazda)', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');

  test('gizleme süresi 14 gün sonrası', () => {
    assert.equal(INSTALL_SNOOZE_DAYS, 14);
    assert.equal(snoozeUntil(now), '2026-11-19T10:00:00.000Z');
  });

  test('süre dolana kadar gizli, dolunca yeniden görünür', () => {
    const until = snoozeUntil(now);
    assert.equal(isSnoozed(until, now), true);
    assert.equal(isSnoozed(until, new Date('2026-11-19T09:59:59.000Z')), true);
    assert.equal(isSnoozed(until, new Date('2026-11-19T10:00:00.000Z')), false);
  });

  test('kayıt yok, bozuk ya da 14 günden uzaksa (elle yazılmış, saat kaymış) gizlemez', () => {
    assert.equal(isSnoozed(null, now), false);
    assert.equal(isSnoozed('', now), false);
    assert.equal(isSnoozed('yarın', now), false);
    assert.equal(isSnoozed('2099-01-01T00:00:00.000Z', now), false);
  });
});

describe('başka tarayıcıda açma bağlantıları', () => {
  test("Safari'de aç: aynı adres x-safari- önekiyle", () => {
    assert.equal(safariUrl('https://axon.example/giris?c=c_abc123'), 'x-safari-https://axon.example/giris?c=c_abc123');
    assert.equal(safariUrl('http://192.168.1.5:3000/dashboard'), 'x-safari-http://192.168.1.5:3000/dashboard');
    assert.equal(safariUrl('javascript:alert(1)'), null);
    assert.equal(safariUrl('bozuk'), null);
  });

  test("Chrome'da aç: Android intent adresi; sorgu korunur, çapa düşer", () => {
    assert.equal(
      chromeIntentUrl('https://axon.example/giris?c=c_abc123#x'),
      'intent://axon.example/giris?c=c_abc123#Intent;scheme=https;package=com.android.chrome;end',
    );
    assert.equal(chromeIntentUrl('https://axon.example/dashboard'), 'intent://axon.example/dashboard#Intent;scheme=https;package=com.android.chrome;end');
    assert.equal(chromeIntentUrl('mailto:a@b.c'), null);
  });
});
