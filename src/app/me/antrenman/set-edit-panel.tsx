'use client';

import { useState } from 'react';
import { Check } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { EFFORT_LABELS, gridOf, type Effort } from '@/lib/progression';
import { SESSION_LIMITS } from '@/lib/schemas/session';
import type { WorkoutRow } from '@/lib/workout-plan';
import { EFFORT_CHOICES } from '@/lib/workout-session';

/** Süreli harekette stepper adımı (sn; giriş paneliyle aynı). */
const SECONDS_STEP = 5;

/** Panelde düzenlenen kaydedilmiş set: kartta satırı vurgulu. */
export type SetEditView = {
  setId: string;
  row: WorkoutRow;
  /** Satırın setleri içindeki sıra (0'dan) ve satırın set sayısı: "Set 2/3". */
  position: number;
  total: number;
  kg: number | undefined;
  value: number;
  /** Setin zorluğu; AMRAP sette sorulmaz (`null`). */
  effort: Effort | undefined | null;
  extra: boolean;
};

export type SetEditValues = { kg?: number | undefined; value: number; effort?: Effort | undefined };

/**
 * Kaydedilmiş seti düzeltmek (tasarım §2.4): tablodaki satıra dokununca giriş panelinin yerinde, satır vurgulu kalır; ayrı
 * sheet yok, danışan neyi düzelttiğini üstte görür. "Set 2/3 · düzenleniyor", setin değerleriyle dolu stepper'lar, zorluk
 * (set başına ayrım burada; AMRAP'ta yok) ve en altta [Vazgeç] [Kaydet]. **Seti sil** üstte, stepper'lardan ve
 * Kaydet'ten uzakta, metin olarak (yıkıcı renk); onay sormaz, toast'taki "Geri al" geri getirir. Klavye ve ekran okuyucu
 * için kaydırmanın "Sil"inin karşılığı budur. Esc "Vazgeç"tir.
 *
 * Değerler yalnız bu panelde; Kaydet'e kadar belgeye yazılmaz (giriş panelinin taslağı gibi saklanmaz: kısa bir iş).
 * Çağıran başka sete geçince paneli `key` ile yeniden kurar.
 */
export function SetEditPanel({
  edit,
  onSave,
  onCancel,
  onDelete,
}: {
  edit: SetEditView;
  onSave: (values: SetEditValues) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [kg, setKg] = useState(edit.kg);
  const [value, setValue] = useState(edit.value);
  const [effort, setEffort] = useState(edit.effort ?? undefined);
  const { row } = edit;
  const weighted = row.trackingType === 'weight_reps' && edit.kg !== undefined;
  const duration = row.trackingType === 'duration';
  const grid = weighted ? gridOf(row.spec) : null;
  const save = () => onSave({ ...(weighted ? { kg } : {}), value, ...(edit.effort !== null ? { effort } : {}) });

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancel();
      }}>
      <div className="flex min-h-11 items-center gap-1.5 text-sm tabular-nums">
        <h2 id="set-edit-title" tabIndex={-1} className="shrink-0 font-medium outline-none">
          Set {edit.position + 1}/{edit.total}
          <span className="font-normal text-muted-foreground">
            <span aria-hidden> · </span>düzenleniyor
          </span>
        </h2>
        {edit.extra ? (
          <Badge variant="secondary" className="shrink-0">
            Fazladan
          </Badge>
        ) : null}
        <Button variant="ghost" className="-mr-2 ml-auto h-11 shrink-0 px-3 text-destructive hover:text-destructive" onClick={onDelete}>
          Seti sil
        </Button>
      </div>
      {weighted ? (
        <Stepper
          size="xl"
          value={kg ?? null}
          onValueChange={(changed) => {
            if (changed !== null && Number.isFinite(changed)) setKg(Math.min(SESSION_LIMITS.kg, Math.max(0, changed)));
          }}
          min={0}
          max={SESSION_LIMITS.kg}
          step={grid ? 0.5 : 1}
          stepFn={grid ? (current, direction) => (direction === 1 ? grid.up(current ?? grid.min, 1) : grid.below(current ?? grid.min, current ?? grid.min)) : undefined}
          inputMode="decimal"
          unit="kg"
          aria-label={`Ağırlık, ${row.title}`}
          decrementLabel="Ağırlığı azalt"
          incrementLabel="Ağırlığı artır"
        />
      ) : null}
      <Stepper
        size="xl"
        value={value}
        onValueChange={(changed) => {
          if (changed !== null && Number.isFinite(changed)) setValue(Math.min(duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps, Math.max(0, Math.round(changed))));
        }}
        min={0}
        max={duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps}
        step={duration ? SECONDS_STEP : 1}
        unit={duration ? 'sn' : 'tekrar'}
        aria-label={duration ? `Süre, ${row.title}` : `Tekrar, ${row.title}`}
        decrementLabel={duration ? 'Süreyi azalt' : 'Tekrarı azalt'}
        incrementLabel={duration ? 'Süreyi artır' : 'Tekrarı artır'}
      />
      {edit.effort !== null ? (
        // Tek satır: giriş panelindeki "Sıradaki" satırının yerinde, panel düzenlerken uzamaz.
        <div role="group" aria-labelledby="set-edit-effort" className="flex min-h-11 items-center gap-2">
          <span id="set-edit-effort" className="shrink-0 text-sm text-muted-foreground">
            Zorluk
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            {EFFORT_CHOICES.map((choice) => (
              <Button
                key={choice}
                variant={effort === choice ? 'default' : 'secondary'}
                aria-pressed={effort === choice}
                className="h-11 min-w-0 px-2"
                onClick={() => setEffort(effort === choice ? undefined : choice)}>
                {EFFORT_LABELS[choice]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_1.6fr] gap-2">
        <Button variant="secondary" size="lg" className="h-14 text-base" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button size="lg" className="h-14 text-base transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100" onClick={save}>
          Kaydet
          <Check data-icon="inline-end" weight="bold" />
        </Button>
      </div>
    </div>
  );
}
