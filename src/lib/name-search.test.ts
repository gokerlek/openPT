import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesName } from './name-search.ts';

describe('ada göre arama', () => {
  test('Türkçe harfler katlanır, kelimelerin hepsi geçmeli, boş arama hepsini tutar', () => {
    assert.equal(matchesName('Gizem Gonca', 'gizem'), true);
    assert.equal(matchesName('Şule Öztürk', 'sule oz'), true);
    assert.equal(matchesName('Şule Öztürk', 'ahmet'), false);
    assert.equal(matchesName('İlker Işık', 'ilker isik'), true);
    assert.equal(matchesName('Ahmet', '   '), true);
  });
});
