/**
 * Adresten (`?error=…`) gelen koda göre metin tablosundan metin: yalnız tablonun kendi anahtarları. `table[code]` kullanılırsa
 * `?error=__proto__` ya da `constructor` nesnenin prototipine düşer ve metin yerine nesne çizilmeye çalışılır.
 */
export function ownText(table: Readonly<Record<string, string>>, code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined;
}
