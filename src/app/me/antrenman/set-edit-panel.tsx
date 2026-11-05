'use client';

import { useState } from 'react';
import { Check } from '@/components/line-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { useLocale } from '@/i18n/client';
import { clientWorkoutMessages } from '@/i18n/messages/client-workout';
import { minutesOf } from '@/lib/cardio';
import { effortLabels, gridOf, type Effort } from '@/lib/progression';
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
 * Kaydedilmiş seti düzenlemek (tasarım §2.4): tablodaki satıra dokununca giriş panelinin yerinde, satır vurgulu kalır; ayrı
 * sheet yok, danışan neyi düzenlediğini üstte görür. "Set 2/3 · düzenleniyor", setin değerleriyle dolu stepper'lar, zorluk
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
  const locale = useLocale();
  const messages = clientWorkoutMessages(locale);
  const t = messages.setEdit;
  const input = messages.input;
  const [kg, setKg] = useState(edit.kg);
  const [value, setValue] = useState(edit.value);
  const [effort, setEffort] = useState(edit.effort ?? undefined);
  const { row } = edit;
  const weighted = row.trackingType === 'weight_reps' && edit.kg !== undefined;
  const duration = row.trackingType === 'duration';
  // Yürüyüş/koşuda süre dakikayla düzeltilir (tablo ve giriş paneli gibi), saniye saklanır.
  const walk = row.cardio === 'walk';
  const valueMax = walk ? SESSION_LIMITS.seconds / 60 : duration ? SESSION_LIMITS.seconds : SESSION_LIMITS.reps;
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
          {messages.entry.set(edit.position + 1, edit.total)}
          <span className="font-normal text-muted-foreground">
            <span aria-hidden> · </span>
            {t.editing}
          </span>
        </h2>
        {edit.extra ? (
          <Badge variant="secondary" className="shrink-0">
            {messages.entry.extra}
          </Badge>
        ) : null}
        <Button variant="ghost" className="-mr-2 ml-auto h-11 shrink-0 px-3 text-destructive hover:text-destructive" onClick={onDelete}>
          {t.delete}
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
          aria-label={input.weight(row.title)}
          decrementLabel={input.weightLess}
          incrementLabel={input.weightMore}
        />
      ) : null}
      <Stepper
        size="xl"
        value={walk ? minutesOf(value) : value}
        onValueChange={(changed) => {
          if (changed === null || !Number.isFinite(changed)) return;
          const shown = Math.min(valueMax, Math.max(0, changed));
          setValue(walk ? Math.round(shown * 60) : Math.round(shown));
        }}
        min={0}
        max={valueMax}
        step={walk ? 1 : duration ? SECONDS_STEP : 1}
        inputMode={walk ? 'decimal' : 'numeric'}
        unit={walk ? input.minutesUnit : duration ? input.secondsUnit : input.repsUnit}
        aria-label={duration ? input.duration(row.title) : input.reps(row.title)}
        decrementLabel={duration ? input.durationLess : input.repsLess}
        incrementLabel={duration ? input.durationMore : input.repsMore}
      />
      {edit.effort !== null ? (
        // Tek satır: giriş panelindeki "Sıradaki" satırının yerinde, panel düzenlerken uzamaz.
        <div role="group" aria-labelledby="set-edit-effort" className="flex min-h-11 items-center gap-2">
          <span id="set-edit-effort" className="shrink-0 text-sm text-muted-foreground">
            {t.effort}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            {EFFORT_CHOICES.map((choice) => (
              <Button
                key={choice}
                variant={effort === choice ? 'default' : 'secondary'}
                aria-pressed={effort === choice}
                className="h-11 min-w-0 px-2"
                onClick={() => setEffort(effort === choice ? undefined : choice)}>
                {effortLabels(locale)[choice]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_1.6fr] gap-2">
        <Button variant="secondary" size="lg" className="h-14 text-base" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button size="lg" className="h-14 text-base transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100" onClick={save}>
          {t.save}
          <Check data-icon="inline-end" weight="bold" />
        </Button>
      </div>
    </div>
  );
}
