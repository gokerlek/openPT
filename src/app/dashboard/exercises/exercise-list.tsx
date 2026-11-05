'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  CaretDown,
  CheckCircle,
  Heartbeat,
  Lightbulb,
  MagnifyingGlass,
  Prohibit,
  Question,
  Warning,
  WarningCircle,
  YoutubeLogo,
  type Icon,
} from '@phosphor-icons/react';
import { CircleDashed } from '@/components/line-icons';
import { Plus } from '@/components/line-icons';
import { RemovableChip } from '@/components/removable-chip';
import { MuscleMap } from '@/components/muscle-map/muscle-map';
import { PageHeader } from '@/components/page-header';
import { TrainingTabs } from '../training-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { ConditionPicker, formatConstraints, parseConstraints } from '@/components/condition-picker';
import { TOUCH_TARGETS } from './touch-targets';
import { conditionLabel, formatCondition } from '@/lib/conditions';
import { lower } from '@/i18n/text';
import { LOCALES } from '@/i18n/locale';
import { careSummary, type EditorCare } from '@/lib/constraint-filter';
import {
  contextLabels,
  decisionLabels,
  filterGroupLabels,
  FILTER_GROUPS,
  inFilterView,
  requiresClearance,
  summarizeFilter,
  type Decision,
  type FilterGroup,
  type FilterView,
} from '@/lib/exercise-filter';
import { searchExercises } from '@/lib/exercise-search';
import { muscleSearchNames } from '@/lib/muscle-names';
import { countByMuscle, isBodyMuscle, parseMuscles, summarizeMuscles, works } from '@/lib/muscles';
import { fetchJson } from '@/lib/query/errors';
import { useServiceQuery } from '@/lib/query/use-service';
import { equipmentLabels, muscleLabels, type Exercise, type Muscle } from '@/lib/schemas/exercise';
import { useLocale, useMessages } from '@/i18n/client';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

type ExerciseWithSource = Exercise & { source: 'library' | 'custom' };

/** Özet çiplerinin ve kart rozetlerinin ikonları: renk tek başına anlam taşımaz. */
const GROUP_ICONS: Record<FilterGroup, Icon> = {
  blocked: Prohibit,
  warned: Warning,
  clear: CheckCircle,
  untagged: CircleDashed,
  unassessed: Question,
};
const DECISION_ICONS: Record<Decision, Icon> = { block: Prohibit, warn: Warning, cue: Lightbulb };

/**
 * Egzersiz listesi: arama ve kas haritasıyla süzme. Her kart detay sayfasına gider;
 * ekleme ve düzenleme kendi sayfalarında (modal değil, SPEC §6).
 *
 * Kas seçimi adres satırında (`?muscle=chest,back`): detaydan geri dönünce ve
 * paylaşılan bağlantıda süzgeç korunur. İlk veri sunucudan gelir, sonrası React Query'de.
 */
export function ExerciseList({
  initial,
  deviceNames,
  notice,
  clientCare = null,
}: {
  initial: ExerciseWithSource[];
  /** Cihaz kimliği → adı: kartta ekipman yerine cihaz yazar. */
  deviceNames: Record<string, string>;
  /** Başlığın altındaki uyarı (ör. okunamayan PT kayıtları); sunucuda hazırlanır. */
  notice?: React.ReactNode;
  /**
   * `?client=c_…` (tasarım `kisit-tarama.md` §2.3): danışanın kayıtlı kısıtlarıyla önizleme, sunucuda hesaplanmış.
   * Adreste yalnız danışan kimliği durur, sağlık verisi değil.
   */
  clientCare?: { name: string; care: EditorCare } | null;
}) {
  const t = useMessages(ptLibraryMessages).exerciseList;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const untaggedHint = t.untaggedHint;
  const muscles = muscleLabels(locale);
  const groupLabels = filterGroupLabels(locale);
  const selected = useMemo(() => parseMuscles(searchParams.get('muscle')), [searchParams]);
  const clientMode = Boolean(clientCare && !clientCare.care.unavailable);
  const constraints = useMemo(() => (clientCare ? [] : parseConstraints(searchParams.get('limit'))), [searchParams, clientCare]);
  const [search, setSearch] = useState('');
  // Kısıt süzgecinin görünümü: hepsi, yasak dışı ya da tek küme (çip, "Yalnız uygunları göster").
  const [view, setView] = useState<FilterView>('all');

  const { data } = useServiceQuery({
    key: ['exercises'],
    fn: ({ signal }) => fetchJson<{ exercises: ExerciseWithSource[] }>('/api/exercises', { signal }),
    initialData: { exercises: initial },
  });

  const exercises = data?.exercises ?? initial;
  const customCount = exercises.filter((item) => item.source === 'custom').length;
  const counts = useMemo(() => countByMuscle(exercises), [exercises]);

  // Sunucuya gitmeden adresi günceller; Next yönlendiricisi `useSearchParams`'ı eşitler.
  function setParams(next: { muscle?: Muscle[]; limit?: ReturnType<typeof parseConstraints> }) {
    const params = new URLSearchParams();
    const muscles = next.muscle ?? selected;
    const limits = next.limit ?? constraints;
    const client = searchParams.get('client');
    if (muscles.length > 0) params.set('muscle', muscles.join(','));
    if (client && clientCare) params.set('client', client);
    else if (limits.length > 0) params.set('limit', formatConstraints(limits));
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  const setSelected = (next: Muscle[]) => setParams({ muscle: next });

  function toggle(muscle: Muscle) {
    setSelected(selected.includes(muscle) ? selected.filter((item) => item !== muscle) : [...selected, muscle]);
  }

  const visible = useMemo(() => {
    // Ada ve kas adına göre, Türkçe harfler katlanarak (düzenleyicinin seçicisiyle aynı arama).
    const matched = searchExercises(exercises, search, (muscle) => muscleSearchNames(muscle, LOCALES)).filter(
      (item) => selected.length === 0 || selected.some((muscle) => works(item, muscle)),
    );
    if (selected.length === 0) return matched;
    // Seçili kası hedef alanlar önce, yalnız yardımcı olarak çalıştıranlar sonra.
    const isTarget = (item: ExerciseWithSource) => selected.some((muscle) => item.primaryMuscles.includes(muscle));
    return [...matched.filter(isTarget), ...matched.filter((item) => !isTarget(item))];
  }, [exercises, search, selected]);

  // Kısıt seçiliyse her hareket süzgeçten geçer ve tek kümeye girer (yasak, uyarı, uygun, kontrol
  // edilmedi, eksik bilgi); karar, eksik bilgi ve "kontrol edilmedi" kartta rozet, sayılar özet çiplerinde.
  // Yalnız danışan bağlamı (ameliyat haftası…) eksikse özet satırında bir kez söylenir.
  const summary = useMemo(
    () => (clientMode && clientCare ? careSummary(exercises, clientCare.care.map) : summarizeFilter(constraints.length === 0 ? [] : exercises, constraints, { locale })),
    [exercises, constraints, clientMode, clientCare, locale],
  );
  const clearance = requiresClearance(constraints);
  const filterOn = clientMode || constraints.length > 0;
  // Katlanan kartın başlık rozeti: danışan bağlamında kayıtlı kısıtlar, değilse adresteki seçim.
  const constraintCount = clientMode && clientCare ? clientCare.care.summary.length : constraints.length;
  // Kısıtlar kartı danışan bağlamında ya da kısıt seçiliyken açık gelir; sonrası PT'nin elinde.
  // Prop'a bağlı olsaydı son kısıt kaldırılınca kart seçicinin altından kapanırdı.
  const [constraintsOpen, setConstraintsOpen] = useState(filterOn || Boolean(clientCare));

  const selectedBody = selected.filter(isBodyMuscle);
  // Görünüm yalnız listeyi daraltır; sayım hep tam liste üstünden. Kısıt yoksa süzgeç yok.
  const activeView: FilterView = !filterOn ? 'all' : view;
  const shown = activeView === 'all' ? visible : visible.filter((item) => inFilterView(summary.groups.get(item.id), activeView));
  const filtering = selected.length > 0 || search.trim().length > 0 || activeView !== 'all';
  const showOnly = (next: FilterView) => (pressed: boolean) => setView(pressed ? next : 'all');

  return (
    <div className="flex flex-col gap-5">
      <TrainingTabs />
      <PageHeader
        title={t.title}
        description={<span className="tabular-nums">{t.summary(exercises.length, customCount)}</span>}
        actions={
          <Button className="touch:min-h-11" nativeButton={false} render={<Link href="/dashboard/exercises/new" />}>
            <Plus data-icon="inline-start" />
            {t.add}
          </Button>
        }
      />
      {notice}

      {/* Arama en üstte: telefonda büyük haritanın ve kısıt kartının altında kalmasın. */}
      <div role="search" className={`flex flex-col gap-2 ${TOUCH_TARGETS}`}>
        <InputGroup>
          <InputGroupAddon>
            <MagnifyingGlass />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
          />
        </InputGroup>

        {filtering ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="tabular-nums">{t.resultCount(shown.length)}</span>
          </p>
        ) : null}
      </div>

      <div className={`grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start ${TOUCH_TARGETS}`}>
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>{t.mapTitle}</CardTitle>
            <CardDescription>{t.mapHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Telefonda harita ekran genişliğinde büyük: parmakla seçilebilsin. */}
            <MuscleMap
              layout="flip"
              selected={selectedBody}
              onToggle={toggle}
              counts={counts}
              hint={t.mapTapHint}
              bodyClassName="h-[min(34rem,68svh)] lg:h-96"
              label={t.mapLabel}
            />

            <div className="flex flex-col gap-3">
              <Toggle
                variant="outline"
                size="lg"
                className="justify-start"
                pressed={selected.includes('cardio')}
                onPressedChange={() => toggle('cardio')}
                disabled={counts.cardio === 0}>
                <Heartbeat data-icon="inline-start" />
                {t.cardio}
                <span className="ml-auto tabular-nums text-muted-foreground">{counts.cardio}</span>
              </Toggle>

              {selectedBody.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" aria-label={t.selectedMuscles}>
                  {selectedBody.map((muscle) => (
                    <RemovableChip
                      key={muscle}
                      label={muscles[muscle]}
                      removeLabel={t.removeMuscleFilter(muscles[muscle])}
                      onRemove={() => toggle(muscle)}
                    />
                  ))}
                </div>
              ) : null}

              {selected.length > 0 ? (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setSelected([])}>
                  {t.clearSelection}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Katlanır kısıt kartı, başlık satırı `summary`. Kartın kendi boşluğu sıfır: üst boşluğu ve başlık-gövde
              aralığını summary'nin dolgusu verir, açıkken düzen eski kartla aynı. */}
          <Card className="gap-0 py-0">
            <details
              open={constraintsOpen}
              onToggle={(event) => setConstraintsOpen(event.currentTarget.open)}
              className="group/constraints">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl p-(--card-spacing) outline-none select-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-safe:transition-colors motion-safe:duration-100 [&::-webkit-details-marker]:hidden">
                {/* `summary` içinde blok öğe geçersiz: CardTitle'ın görünümü bir `span`'de. */}
                <span className="font-heading text-base leading-snug font-medium">{t.limitationsTitle}</span>
                {constraintCount > 0 ? (
                  <Badge variant="secondary">
                    <span className="tabular-nums" aria-hidden>
                      {constraintCount}
                    </span>
                    <span className="sr-only">{clientMode ? t.savedLimitations(constraintCount) : t.selectedLimitations(constraintCount)}</span>
                  </Badge>
                ) : null}
                <CaretDown
                  aria-hidden
                  className="ml-auto size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-160 group-open/constraints:rotate-180"
                />
              </summary>
              <CardContent className="flex flex-col gap-3 pb-(--card-spacing)">
                <CardDescription>
                  {t.limitationsIntro}
                </CardDescription>
                {clientCare ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p>
                      <span className="font-medium">{clientCare.name}</span>
                      {clientCare.care.unavailable
                        ? ` · ${clientCare.care.unavailable}`
                        : clientCare.care.summary.length > 0
                          ? t.savedList(clientCare.care.summary.join(' · '))
                          : t.noActive}
                      {clientCare.care.pending.length > 0 ? t.pendingList(clientCare.care.pending.join(' · ')) : ''}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Link href={`/dashboard/clients/${clientCare.care.clientId}/constraints`} className="underline-offset-4 hover:underline">
                        {t.limitationsLink}
                      </Link>
                      <Link href="/dashboard/exercises" className="text-muted-foreground underline-offset-4 hover:underline">
                        {t.withoutClient}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-sm">
                    <ConditionPicker
                      id="constraint"
                      placeholder={t.limitationPlaceholder}
                      label={t.limitationPlaceholder}
                      value={constraints.map(formatCondition)}
                      onChange={(next) => setParams({ limit: parseConstraints(next.join(',')) })}
                    />
                  </div>
                )}

                {filterOn ? (
                  <div className="flex flex-col gap-3 text-sm">
                    {/* Her hareket tek kümede; çipe dokununca liste o kümeye süzülür, yeniden dokununca hepsi. */}
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.summaryLabel}>
                      {FILTER_GROUPS.map((group) => {
                        const GroupIcon = GROUP_ICONS[group];
                        return (
                          <Toggle
                            key={group}
                            variant="outline"
                            size="sm"
                            className={group === 'blocked' ? 'text-destructive' : undefined}
                            pressed={activeView === group}
                            onPressedChange={showOnly(group)}
                            disabled={summary.counts[group] === 0 && activeView !== group}>
                            <GroupIcon data-icon="inline-start" aria-hidden />
                            <span className="tabular-nums">{summary.counts[group]}</span> {groupLabels[group]}
                          </Toggle>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-1 text-muted-foreground" aria-live="polite">
                      {/* Kısıt değişince sayılar duyurulsun (çipler düğme; canlı bölgede değiller). */}
                      <p className="sr-only">
                        {FILTER_GROUPS.map((group) => `${summary.counts[group]} ${groupLabels[group]}`).join(', ')}
                      </p>
                      {summary.warnedUnassessed > 0 ? (
                        <p>
                          {t.warnedUnassessed(summary.warnedUnassessed)}
                        </p>
                      ) : null}
                      {summary.pending.rules > 0 ? (
                        <p>
                          {t.pendingRules(summary.pending.rules, summary.pending.needs.map((need) => contextLabels(locale)[need]).join(', '))}
                        </p>
                      ) : null}
                    </div>
                    {clearance.length > 0 ? (
                      <p className="flex items-start gap-1.5 text-destructive">
                        <WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {t.redFlag(clearance.map((condition) => conditionLabel(condition, locale)).join(', '))}
                        </span>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Toggle
                        variant="outline"
                        size="sm"
                        pressed={activeView === 'notBlocked'}
                        onPressedChange={showOnly('notBlocked')}
                        disabled={summary.counts.blocked === 0 && activeView !== 'notBlocked'}>
                        {t.hideBlocked}
                      </Toggle>
                      <Toggle
                        variant="outline"
                        size="sm"
                        pressed={activeView === 'clear'}
                        onPressedChange={showOnly('clear')}
                        disabled={summary.counts.clear === 0 && activeView !== 'clear'}>
                        {t.onlySuitable}
                      </Toggle>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </details>
          </Card>

          {shown.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MagnifyingGlass />
                </EmptyMedia>
                <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                <EmptyDescription>
                  {activeView === 'all'
                    ? t.emptyAll
                    : t.emptyView}
                </EmptyDescription>
              </EmptyHeader>
              {selected.length > 0 || activeView !== 'all' ? (
                <EmptyContent className="flex-row flex-wrap justify-center">
                  {activeView !== 'all' ? (
                    <Button variant="outline" size="sm" onClick={() => setView('all')}>
                      {t.showAll}
                    </Button>
                  ) : null}
                  {selected.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                      {t.clearSelection}
                    </Button>
                  ) : null}
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            // `popLayout`: çıkan kart mutlak konuma alınır; konum listeye göre hesaplansın diye `relative`.
            <ul className="relative grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((item) => {
                  const verdict = summary.cards.get(item.id);
                  const unassessed = verdict?.unassessed ?? 0;
                  const unchecked = summary.groups.get(item.id) === 'untagged';
                  const DecisionIcon = verdict?.decision ? DECISION_ICONS[verdict.decision] : null;
                  const onlySecondary =
                    selected.length > 0 && !selected.some((muscle) => item.primaryMuscles.includes(muscle));
                  return (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}>
                      <Link
                        href={`/dashboard/exercises/${item.id}`}
                        title={verdict?.message ?? (unchecked ? untaggedHint : undefined)}
                        className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <Card
                          size="sm"
                          className={`h-full transition-colors hover:bg-muted/40 ${
                            verdict?.decision === 'block' ? 'border-destructive/50 bg-destructive/5' : ''
                          }`}>
                          <CardHeader>
                            <CardTitle className="truncate">{item.title}</CardTitle>
                            {/* `min-w-0`: uzun kas/ekipman satırı kısalır, rozetler kartın dışına taşmaz. */}
                            <CardDescription className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">
                                {summarizeMuscles(item.primaryMuscles, locale).join(', ')} ·{' '}
                                {(item.deviceId && deviceNames[item.deviceId]) || equipmentLabels(locale)[item.equipment]}
                              </span>
                              {item.video ? <YoutubeLogo className="size-4 shrink-0" aria-label={t.hasVideo} /> : null}
                            </CardDescription>
                            {item.source === 'custom' || onlySecondary || verdict || unchecked ? (
                              // Rozetler en çok 9 rem: dar kartta alt satıra geçer, başlığa en az ~120 px kalır.
                              <CardAction className="flex max-w-36 flex-wrap justify-end gap-1">
                                {verdict?.decision && DecisionIcon ? (
                                  <Badge variant={verdict.decision === 'block' ? 'destructive' : 'outline'}>
                                    <DecisionIcon data-icon="inline-start" aria-hidden />
                                    {lower(locale, decisionLabels(locale)[verdict.decision])}
                                  </Badge>
                                ) : null}
                                {unassessed > 0 ? (
                                  <Badge
                                    variant="outline"
                                    title={t.unassessedTitle(unassessed)}>
                                    <Question data-icon="inline-start" aria-hidden />
                                    <span aria-hidden>{t.missingInfo}</span>
                                    <span className="sr-only">{t.unassessedSr(unassessed)}</span>
                                  </Badge>
                                ) : null}
                                {unchecked ? (
                                  <Badge variant="outline" className="text-muted-foreground" title={untaggedHint}>
                                    <CircleDashed data-icon="inline-start" aria-hidden />
                                    {t.unchecked}
                                  </Badge>
                                ) : null}
                                {onlySecondary ? <Badge variant="outline">{t.secondary}</Badge> : null}
                                {item.source === 'custom' ? <Badge variant="secondary">{t.mine}</Badge> : null}
                              </CardAction>
                            ) : null}
                          </CardHeader>
                        </Card>
                      </Link>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
