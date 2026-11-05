'use client';
import { DatePicker } from '@/components/date-picker';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { ChoiceChips } from '@/components/choice-chips';
import { Check, X } from '@/components/line-icons';
import { SectionHeader } from '@/components/section-header';
import { UnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { Toggle } from '@/components/ui/toggle';
import { useLocale, useMessages } from '@/i18n/client';
import { commonMessages } from '@/i18n/messages/common';
import { screeningMessages } from '@/i18n/messages/screening';
import { getFormat } from '@/lib/format';
import { fetchJson } from '@/lib/query/errors';
import { useServiceMutation } from '@/lib/query/use-service';
import {
  BALANCE_SECONDS,
  LEG_LENGTH_CM,
  reachPercent,
  notTestedReasonLabels,
  NOT_TESTED_REASONS,
  outcomeLabels,
  outcomeOf,
  resultChoiceLabels,
  RESULT_CHOICES,
  SCREENING_TEST_IDS,
  screeningTest,
  screeningKey,
  sideEntry,
  sidesOf,
  type ScreeningTestId,
  type SideKey,
} from '@/lib/screening';
import { cn } from '@/lib/utils';
import { decimal, EMPTY_SIDE, testsOf, toEntry, type ScreeningDraftState, type SideState, type TestExtra } from './screening-state';

export type ScreeningFormMode = { kind: 'new'; today: string; screenedDates: string[] } | { kind: 'edit'; date: string };

const draftKey = (clientId: string, mode: ScreeningFormMode) => `pulsecoach.screening-draft.${clientId}.${mode.kind === 'edit' ? mode.date : 'new'}`;

function readDraftText(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function readDraft(key: string): ScreeningDraftState | null {
  try {
    const text = readDraftText(key);
    return text ? (JSON.parse(text) as ScreeningDraftState) : null;
  } catch {
    return null;
  }
}

/** `sessionStorage` başka sekmeden değişmez: abonelik gerekmez. */
const noSubscribe = () => () => undefined;

function writeDraft(key: string, state: ScreeningDraftState | null) {
  try {
    if (state) window.sessionStorage.setItem(key, JSON.stringify(state));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Özel pencere ya da dolu depo: taslak tutulmaz, form yine çalışır.
  }
}

function SideInput({
  testId,
  side,
  state,
  onChange,
}: {
  testId: ScreeningTestId;
  side: SideKey;
  state: SideState;
  onChange: (next: SideState) => void;
}) {
  const locale = useLocale();
  const messages = useMessages(screeningMessages);
  const common = useMessages(commonMessages);
  const t = messages.form;
  const test = screeningTest(testId, locale);
  const id = screeningKey(testId, side).replace('.', '-');
  const outcome = outcomeOf(testId, toEntry(state));
  const pointsOpen = !state.pain && (state.result === 'standard' || state.result === 'easier');
  const seconds = decimal(state.seconds);
  const percent = reachPercent(decimal(state.reachCm), decimal(state.legCm ?? ""));
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {side !== 'center' ? <p className="text-sm font-medium">{messages.sides[side]}</p> : null}
      <div className="flex flex-col gap-2">
        <Toggle
          variant="outline"
          pressed={state.pain}
          onPressedChange={(pain) => onChange({ ...state, pain })}
          className={cn('h-11 w-fit px-4', state.pain && 'border-destructive text-destructive-text')}>
          {state.pain ? <WarningCircle weight="fill" data-icon="inline-start" /> : null}
          {t.pain}
        </Toggle>
        {state.pain ? (
          <>
            <p className="text-sm font-medium text-destructive-text">{t.painStop}</p>
            <Field>
              <FieldLabel htmlFor={`${id}-pain`} className="text-xs">
                {t.painWhere}
              </FieldLabel>
              <Input id={`${id}-pain`} maxLength={140} value={state.painNote} onChange={(event) => onChange({ ...state, painNote: event.currentTarget.value })} />
            </Field>
          </>
        ) : null}
      </div>
      <Field>
        <FieldLabel id={`${id}-version`} className="text-xs">
          {t.version}
        </FieldLabel>
        <ChoiceChips
          labelledBy={`${id}-version`}
          value={state.result}
          disabled={state.pain}
          options={RESULT_CHOICES.map((choice) => ({ value: choice, label: resultChoiceLabels(locale)[choice] }))}
          onChange={(result) => onChange({ ...state, ...(result ? { result } : { result: undefined }) })}
        />
      </Field>
      {state.result === 'not_tested' && !state.pain ? (
        <Field>
          <FieldLabel id={`${id}-reason`} className="text-xs">
            {t.reason}
          </FieldLabel>
          <ChoiceChips
            labelledBy={`${id}-reason`}
            value={state.reason}
            options={NOT_TESTED_REASONS.map((reason) => ({ value: reason, label: notTestedReasonLabels(locale)[reason] }))}
            onChange={(reason) => onChange({ ...state, ...(reason ? { reason } : { reason: undefined }) })}
          />
        </Field>
      ) : null}
      {testId === 'single_leg_balance' && pointsOpen ? (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor={`${id}-seconds`} className="text-xs">
              {t.seconds}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${id}-seconds`}
                inputMode="numeric"
                value={state.seconds}
                onChange={(event) => onChange({ ...state, seconds: event.currentTarget.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{t.secondsUnit}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-reach`} className="text-xs">
              {t.reach}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${id}-reach`}
                inputMode="decimal"
                value={state.reachCm}
                onChange={(event) => onChange({ ...state, reachCm: event.currentTarget.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{common.units.cm}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field className="col-span-2">
            <FieldLabel htmlFor={`${id}-leg`} className="text-xs">{t.leg}</FieldLabel>
            <InputGroup>
              <InputGroupInput id={`${id}-leg`} inputMode="decimal" value={state.legCm ?? ''}
                onChange={(event) => onChange({ ...state, legCm: event.currentTarget.value })} />
              <InputGroupAddon align="inline-end"><InputGroupText>{common.units.cm}</InputGroupText></InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t.legHint(LEG_LENGTH_CM.min, LEG_LENGTH_CM.max)}
              {percent !== undefined ? t.legPercent(getFormat(locale).number(percent)) : t.legPercentHint}
            </FieldDescription>
          </Field>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-1.5" disabled={!pointsOpen}>
        <legend className="mb-1.5 text-xs font-medium">{t.missed}</legend>
        <div className={cn('flex flex-wrap gap-1.5', !pointsOpen && 'opacity-50')}>
          {test.points.map((point) => {
            // Dengede süre girildiyse "30 sn dolmadı" süreden hesaplanır.
            const derived = point.id === 'time' && seconds !== undefined;
            const pressed = derived ? seconds < BALANCE_SECONDS : state.missed.includes(point.id);
            return (
              <Toggle
                key={point.id}
                variant="outline"
                pressed={pressed}
                disabled={!pointsOpen || derived}
                onPressedChange={(next) => onChange({ ...state, missed: next ? [...state.missed, point.id] : state.missed.filter((item) => item !== point.id) })}
                className="h-11 px-3 text-sm">
                {pressed ? <X data-icon="inline-start" /> : null}
                {point.label}
              </Toggle>
            );
          })}
        </div>
      </fieldset>
      <p className="text-sm font-medium" aria-live="polite">
        {outcome ? outcomeLabels(locale)[outcome] : t.noVersion}
      </p>
    </div>
  );
}

/**
 * Tarama girişi ve düzenlemesi (tasarım `kisit-tarama.md` §4.5): tablet öncelikli; her test kartında kurulum, sayım
 * kuralı, kolaylaştırılmış sürüm; tarafta önce ağrı (açılınca test durur), sonra sürüm ve kaçan noktalar. Sonuç
 * canlı hesaplanır, sözcükle yazılır. Etkin kısıtlar başlıkta; görüşü alınmamış kırmızı bayrak bölgesine değen testler
 * "Yapılmadı (kısıt)" hazır gelir. Taslak yalnız `sessionStorage`'da (sekmeyle gider).
 */
export function ScreeningForm({
  clientId,
  mode,
  initial,
  title,
  description,
  actions,
  constraintsNote,
}: {
  clientId: string;
  mode: ScreeningFormMode;
  initial: ScreeningDraftState;
  title: string;
  description: string;
  actions?: React.ReactNode;
  constraintsNote?: React.ReactNode;
}) {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages(screeningMessages);
  const t = messages.form;
  const common = useMessages(commonMessages);
  const base = `/dashboard/clients/${clientId}/screening`;
  const key = draftKey(clientId, mode);
  const [state, setState] = useState<ScreeningDraftState>(initial);
  const [dirty, setDirty] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kaydedilmemiş taslak varsa sunulur, kendiliğinden uygulanmaz (sunucuda taslak yok: hidrasyon aynı).
  const savedText = useSyncExternalStore(noSubscribe, () => readDraftText(key), () => null);
  const offered = useMemo(() => {
    if (dirty || dismissed || !savedText || savedText === JSON.stringify(initial)) return null;
    return readDraft(key);
  }, [dirty, dismissed, savedText, initial, key]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => writeDraft(key, state), 400);
    return () => window.clearTimeout(timer);
  }, [dirty, key, state]);

  const update = (next: ScreeningDraftState) => {
    setState(next);
    setDirty(true);
    setError(null);
  };
  const setSide = (sideKey: string, next: SideState) => update({ ...state, sides: { ...state.sides, [sideKey]: next } });
  const setExtra = (testId: ScreeningTestId, next: TestExtra) => update({ ...state, extras: { ...state.extras, [testId]: next } });

  const tests = useMemo(() => testsOf(state), [state]);
  const done = (testId: ScreeningTestId) => sidesOf(testId).every((side) => outcomeOf(testId, sideEntry(tests, testId, side)) !== null);
  const started = (testId: ScreeningTestId) => sidesOf(testId).some((side) => outcomeOf(testId, sideEntry(tests, testId, side)) !== null);

  const save = useServiceMutation({
    fn: () =>
      mode.kind === 'new'
        ? fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings`, { method: 'POST', body: JSON.stringify({ date: state.date, tests, note: state.note }) })
        : fetchJson<{ ok: true }>(`/api/clients/${clientId}/screenings/${mode.date}`, { method: 'PUT', body: JSON.stringify({ tests, note: state.note }) }),
    notify: { success: mode.kind === 'new' ? t.saved : t.updated },
    onError: (failure) => setError(Object.values(failure.fields)[0] ?? failure.message),
    onSuccess: () => {
      writeDraft(key, null);
      router.push(base);
      router.refresh();
    },
  });

  const submit = () => {
    if (Object.keys(tests).length === 0) {
      setError(messages.errors.empty);
      return;
    }
    save.mutate();
  };
  const saveButton = (className?: string) => (
    <Button type="button" disabled={save.isPending} onClick={submit} className={className}>
      {save.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      {save.isPending ? common.actions.saving : common.actions.save}
    </Button>
  );
  const taken = mode.kind === 'new' && mode.screenedDates.includes(state.date);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        back={{ href: base, label: t.back }}
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {saveButton('hidden sm:inline-flex')}
          </>
        }
      />

      {offered ? (
        <Alert>
          <WarningCircle />
          <AlertTitle>{t.draftTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setState(offered);
                setDirty(true);
              }}>
              {t.draftContinue}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                writeDraft(key, null);
                setDismissed(true);
              }}>
              {t.draftDiscard}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {constraintsNote}

      {mode.kind === 'new' ? (
        <Field className="max-w-xs">
          <FieldLabel htmlFor="screening-date">{t.date}</FieldLabel>
          <DatePicker id="screening-date" max={mode.today} value={state.date} onValueChange={value => update({ ...state, date: value })} />
          {taken ? <FieldDescription>{t.dateTaken(getFormat(locale).day(state.date))}</FieldDescription> : null}
        </Field>
      ) : null}

      <nav aria-label={t.tests} className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur [scrollbar-width:none]">
        <ol className="flex w-max gap-1.5">
          {SCREENING_TEST_IDS.map((testId, index) => (
            <li key={testId}>
              <a
                href={`#test-${testId}`}
                className={cn(
                  'flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap hover:bg-muted',
                  done(testId) && 'border-primary/50',
                )}>
                <span className="tabular-nums">{index + 1}</span> {screeningTest(testId, locale).short}
                {done(testId) ? <CheckCircle weight="fill" className="size-4 text-primary" aria-label={t.filled} /> : started(testId) ? <span className="sr-only">{t.partial}</span> : null}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {SCREENING_TEST_IDS.map((testId, index) => {
        const test = screeningTest(testId, locale);
        const extra = state.extras[testId] ?? { note: '' };
        return (
          <Card key={testId} id={`test-${testId}`} className="scroll-mt-20">
            <CardHeader>
              <CardTitle>{t.cardTitle(index + 1, test.title)}</CardTitle>
              <CardDescription className="flex flex-col gap-1">
                <span>{test.setup}</span>
                <span>
                  {testId === 'single_leg_balance' ? t.countBalance : t.count} {test.sideNote ?? ''}
                </span>
                <span>{t.easier(test.easier)}</span>
                <span className="text-xs">{t.source(test.source)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className={cn('grid gap-3', test.sided && 'md:grid-cols-2')}>
                {sidesOf(testId).map((side) => {
                  const sideKey = screeningKey(testId, side);
                  return <SideInput key={sideKey} testId={testId} side={side} state={state.sides[sideKey] ?? EMPTY_SIDE} onChange={(next) => setSide(sideKey, next)} />;
                })}
              </div>
              {testId === 'squat' ? (
                <Field>
                  <FieldLabel id="heel-label" className="text-xs">
                    {t.heelSupport}
                  </FieldLabel>
                  <ChoiceChips
                    labelledBy="heel-label"
                    value={extra.heelSupportHelps === undefined ? undefined : extra.heelSupportHelps ? 'yes' : 'no'}
                    options={[
                      { value: 'yes', label: common.states.yes },
                      { value: 'no', label: common.states.no },
                    ]}
                    onChange={(next) => {
                      const { heelSupportHelps: _heel, ...rest } = extra;
                      setExtra(testId, next === undefined ? rest : { ...rest, heelSupportHelps: next === 'yes' });
                    }}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`note-${testId}`} className="text-xs">
                  {t.note}
                </FieldLabel>
                <Input id={`note-${testId}`} maxLength={140} value={extra.note} onChange={(event) => setExtra(testId, { ...extra, note: event.currentTarget.value })} />
              </Field>
            </CardContent>
          </Card>
        );
      })}

      <Field>
        <FieldLabel htmlFor="screening-note">{t.screeningNote}</FieldLabel>
        <Input id="screening-note" maxLength={500} value={state.note} onChange={(event) => update({ ...state, note: event.currentTarget.value })} />
      </Field>

      {error ? (
        <Alert variant="destructive" data-form-error>
          <WarningCircle />
          <AlertTitle>{t.saveFailed}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-(--dock-clearance) z-20 flex items-center justify-end gap-3 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur sm:hidden">
        {saveButton('h-11 px-5')}
      </div>

      <UnsavedChangesGuard active={dirty && !save.isPending && !save.isSuccess} description={t.leaveDescription} onLeave={() => undefined} />
    </div>
  );
}
