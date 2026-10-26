import { fold } from './exercise-search.ts';

/** Danışan adında arama (Danışanlar listesi): Türkçe harfler katlanır, boşlukla ayrılan kelimelerin hepsi geçmeli. */
export function matchesName(name: string, query: string): boolean {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  const folded = fold(name);
  return tokens.every((token) => folded.includes(token));
}
