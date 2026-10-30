'use client';

import { createContext, useContext } from 'react';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import type { WorkoutResponse } from '@/lib/workout-routes';
import { saveWorkoutCache } from './workout-storage';

/**
 * Bugün'ün `GET /api/me/workout` sorgusu ve tek seferlik program seçimi — Bugün'ün parçalarının ortak kaynağı
 * (`today-workout.tsx`, `training-week.tsx`). İkisi de buradan okur; birbirini içe aktarmaz. Eski içe aktarmalar için
 * `today-workout.tsx` aynı adları yeniden dışa verir.
 */

export const WORKOUT_KEY = ['me', 'workout'] as const;
/** Bugün'ün yanıtları (programa göre); `setQueriesData` ile hepsi birden güncellenir, muadil sorguları değil. */
export const WORKOUT_OVERVIEW_KEY = [...WORKOUT_KEY, 'overview'] as const;

/**
 * Bugün'ün tek seferlik program seçimi (`?program=op_…|pt`, `docs/design/kendi-program.md` §2.6): Bugün'ün
 * parçaları yanıtı o programla çeker; yoksa kalıcı seçim (sunucu karar verir).
 */
const WorkoutProgramContext = createContext<string | null>(null);

export function WorkoutProgramProvider({ program, children }: { program: string | null; children: React.ReactNode }) {
  return <WorkoutProgramContext.Provider value={program}>{children}</WorkoutProgramContext.Provider>;
}

/** Tek seferlik seçimin adres parçası (`program=…`); yoksa boş. */
export function useWorkoutProgram(): string | null {
  return useContext(WorkoutProgramContext);
}

/** Bugün'ün yanıtı: bir kez çekilir ve telefonda saklanır ("Antrenmana başla" ağ beklemez). */
export function useWorkoutOverview(clientId: string) {
  const program = useWorkoutProgram();
  return useServiceQuery<WorkoutResponse>({
    key: [...WORKOUT_OVERVIEW_KEY, program ?? 'default'],
    fn: async ({ signal }) => {
      const data = await fetchJson<WorkoutResponse>(`/api/me/workout${program ? `?program=${encodeURIComponent(program)}` : ''}`, { signal });
      saveWorkoutCache(clientId, data);
      return data;
    },
    // Bugün'ün sayıları olmasa da sayfa çalışır; hata bildirimi kartın kendisinde.
    notify: 'none',
  });
}
