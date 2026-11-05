import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  intlLocale,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_NAMES,
  LOCALES,
  localeCookie,
  localeFromRequest,
  negotiateLocale,
  resolveLocale,
} from './locale.ts';

describe('diller', () => {
  test('kod varsayılanı Türkçe, tarayıcı ikisini de istemiyorsa İngilizce', () => {
    assert.deepEqual([...LOCALES], ['tr', 'en']);
    assert.equal(DEFAULT_LOCALE, 'tr');
    assert.equal(FALLBACK_LOCALE, 'en');
  });

  test('diller kendi adlarıyla', () => {
    assert.deepEqual(LOCALE_NAMES, { tr: 'Türkçe', en: 'English' });
  });

  test('isLocale yalnız bilinen kodlar', () => {
    for (const value of ['tr', 'en']) assert.equal(isLocale(value), true, value);
    for (const value of ['TR', 'tr-TR', 'de', '', null, undefined, 1, {}]) assert.equal(isLocale(value), false, String(value));
  });

  test('Intl yerel ayarı', () => {
    assert.equal(intlLocale('tr'), 'tr-TR');
    assert.equal(intlLocale('en'), 'en-GB');
  });
});

describe('Accept-Language', () => {
  const cases: [string | null | undefined, 'tr' | 'en'][] = [
    ['tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7', 'tr'],
    ['en-US,en;q=0.9,tr;q=0.8', 'en'],
    ['tr', 'tr'],
    ['TR-tr', 'tr'],
    ['en-GB', 'en'],
    ['de-DE,de;q=0.9', 'en'],
    // Listede tr var, en yok: ağırlığı düşük de olsa Türkçe.
    ['de,tr;q=0.8', 'tr'],
    ['de,en;q=0.5,tr;q=0.8', 'tr'],
    ['de,tr;q=0.5,en;q=0.8', 'en'],
    // Eşit ağırlıkta önce yazılan.
    ['en,tr', 'en'],
    ['tr,en', 'tr'],
    // q=0 "istemiyorum" demek.
    ['tr;q=0,en;q=0.1', 'en'],
    ['tr;q=0', 'en'],
    ['tr;q=abc,en;q=0.2', 'en'],
    ['*', 'en'],
    ['  tr-TR ; q=0.9 , de ', 'tr'],
    ['', 'en'],
    [null, 'en'],
    [undefined, 'en'],
  ];
  for (const [header, expected] of cases) {
    test(`${JSON.stringify(header)} → ${expected}`, () => assert.equal(negotiateLocale(header), expected));
  }
});

describe('isteğin dili', () => {
  test('geçerli çerez başlığı yener', () => {
    assert.equal(resolveLocale({ cookie: 'en', acceptLanguage: 'tr' }), 'en');
    assert.equal(resolveLocale({ cookie: 'tr', acceptLanguage: 'en-US' }), 'tr');
  });

  test('geçersiz çerez yok sayılır', () => {
    assert.equal(resolveLocale({ cookie: 'de', acceptLanguage: 'tr' }), 'tr');
    assert.equal(resolveLocale({ cookie: '', acceptLanguage: 'tr' }), 'tr');
    assert.equal(resolveLocale({ cookie: null, acceptLanguage: 'en' }), 'en');
    assert.equal(resolveLocale({}), 'en');
  });

  test('istekten: çerez başlığı ve Accept-Language', () => {
    const request = (headers: Record<string, string>) => new Request('https://ornek.test/offline', { headers });
    assert.equal(localeFromRequest(request({ cookie: `a=1; ${LOCALE_COOKIE}=en; b=2`, 'accept-language': 'tr' })), 'en');
    assert.equal(localeFromRequest(request({ cookie: `${LOCALE_COOKIE}=tr`, 'accept-language': 'en' })), 'tr');
    assert.equal(localeFromRequest(request({ cookie: `${LOCALE_COOKIE}=xx`, 'accept-language': 'tr-TR' })), 'tr');
    // Adı benzeyen başka çerez sayılmaz.
    assert.equal(localeFromRequest(request({ cookie: `my${LOCALE_COOKIE}=en`, 'accept-language': 'tr' })), 'tr');
    assert.equal(localeFromRequest(request({ 'accept-language': 'en-US' })), 'en');
    assert.equal(localeFromRequest(request({})), 'en');
  });

  test('dil seçicinin yazdığı çerez', () => {
    assert.equal(localeCookie('en', true), 'locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    assert.equal(localeCookie('tr', false), 'locale=tr; Path=/; Max-Age=31536000; SameSite=Lax');
  });
});
