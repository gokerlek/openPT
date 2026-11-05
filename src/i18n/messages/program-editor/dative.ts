/**
 * Sayıya gelen yönelme eki ("2'ye", "6'ya", "3'e", "10'a"): son okunan sözcüğün ünlüsüne göre. Yalnız Türkçe sözlük
 * (`tr.ts`) kullanır; `lib/edit-messages.ts` testler için yeniden dışa açar.
 */
export function dativeOf(value: number): string {
  const n = Math.abs(Math.trunc(value));
  const units = ["'a", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"];
  const tens = ["'a", "'a", "'ye", "'a", "'a", "'ye", "'a", "'e", "'e", "'a"];
  if (n === 0) return `${n}'a`;
  if (n % 100 === 0) return `${n}'e`;
  const unit = n % 10;
  return `${n}${unit === 0 ? tens[Math.floor(n / 10) % 10] : units[unit]}`;
}
