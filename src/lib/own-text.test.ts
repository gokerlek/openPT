import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ownText } from './own-text.ts';

describe('adresten gelen kodla metin tablosu', () => {
  const table = { yetkisiz: 'Bu hesap uygulamanın sahibi değil.', iptal: 'Giriş yarıda kaldı.' };

  test('tablodaki kodun metni gelir', () => {
    assert.equal(ownText(table, 'iptal'), 'Giriş yarıda kaldı.');
  });

  test('tabloda olmayan kod ve nesnenin kalıtım anahtarları (`?error=__proto__`) undefined', () => {
    for (const code of ['yok', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      assert.equal(ownText(table, code), undefined, code);
    }
    assert.equal(ownText(table, undefined), undefined);
  });
});
