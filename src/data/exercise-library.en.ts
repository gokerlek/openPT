/**
 * Hazır egzersiz kütüphanesinin İngilizcesi, kimliğe göre (`exercise-library.ts`). Eksik kimlik ya da alan Türkçesiyle
 * gösterilir (`library-text.ts`). Boş yer tutucu: çeviriler ayrı görevde gelir.
 */
export type ExerciseTextEn = { title: string; description?: string; cues?: readonly string[] };
export const EXERCISE_LIBRARY_EN: Readonly<Record<string, ExerciseTextEn>> = {};
