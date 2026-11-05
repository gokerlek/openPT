import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { imageProblem } from './image.ts';

/** Tarayıcının bildirdiği tür ve boyut yeter (içerik `sniffImage` ile sunucuda denetlenir). */
const picked = (type: string, size: number) => ({ type, size }) as File;
const MB = 1024 * 1024;

describe('seçilen görselin sorunu okuyanın dilinde', () => {
  test('Türkçe metin aynı kalır (dil verilmezse Türkçe)', () => {
    assert.equal(imageProblem(picked('image/svg+xml', 10)), 'Yalnız PNG, JPG ya da WebP seçebilirsin.');
    assert.equal(imageProblem(picked('image/png', 1.5 * MB)), 'Görsel 1,5 MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.');
    assert.equal(imageProblem(picked('image/png', 1.5 * MB), 'tr'), 'Görsel 1,5 MB; en fazla 1 MB olabilir. Daha küçük bir görsel seç.');
    assert.equal(imageProblem(picked('image/webp', MB)), null);
  });

  test('İngilizce: metin ve ondalık noktası', () => {
    assert.equal(imageProblem(picked('image/gif', 10), 'en'), 'You can only choose a PNG, JPG or WebP image.');
    assert.equal(imageProblem(picked('image/jpeg', 2.25 * MB), 'en'), 'The image is 2.3 MB; it can be 1 MB at most. Choose a smaller image.');
    assert.equal(imageProblem(picked('image/png', 10), 'en'), null);
  });
});
