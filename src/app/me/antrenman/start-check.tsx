'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { CheckInResponse } from '@/lib/check-in-routes';
import { formatNumber } from '@/lib/format';
import type { Readiness } from '@/lib/schemas/health';
import {
  adjustDay,
  asksAnything,
  canBegin,
  DIRECTION_CHOICES,
  evaluateStart,
  IRRITABILITY_CHOICES,
  isFreshStart,
  PAIN_SCALE_ENDS,
  READINESS_KEYS,
  READINESS_QUESTIONS,
  RED_FLAG_CHOICES,
  startCheckInBody,
  withLighter,
  type StartAnswers,
  type StartOutcome,
} from '@/lib/session-check';
import type { LocalWorkout } from '@/lib/workout-outbox';
import { checkAsked, fetchCheckContext, flushCheckIns, markCheckAsked, queueCheckIn, readCheckCache } from '../check-in-storage';
import { ChoiceField, ScaleField } from '../check-scale';

const FIVE = [1, 2, 3, 4, 5] as const;
const ELEVEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Step = 'ask' | 'lighten' | 'stop';

/** Ekranın yoklamayı kapatması (geri tuşu açık sheet'in altında geçmişi oynattı): Android'in geri hareketi gibi. */
export type StartCheckHandle = { close: () => void };

function painText(value: number): string {
  return value === 0 ? `0 · ${PAIN_SCALE_ENDS.low}` : value === 10 ? `10 · ${PAIN_SCALE_ENDS.high}` : `${formatNumber(value)}/10`;
}

/** "Bugün yük yok" ekranının metni: yeni belirti acil olabilir (Finucane 2020: aynı gün sevk). */
function stopText(answers: StartAnswers): string {
  const urgent = answers.redFlag === 'bladder_bowel_change' || answers.redFlag === 'new_neuro_deficit';
  const cause =
    answers.redFlag && answers.redFlag !== 'none'
      ? `Yeni başlayan bir belirti bildirdin (${RED_FLAG_CHOICES[answers.redFlag].toLocaleLowerCase('tr')}).`
      : 'Ağrın kola ya da bacağa yayılıyor.';
  return `${cause} Bugün yüklenme; antrenörüne haber ver ve bir sağlık uzmanına görün.${urgent ? ' Bu belirti yeni başladıysa beklemeden acil servise başvur.' : ''}`;
}

/**
 * Antrenman başındaki yoklama (tasarım §2.2; SPEC §7.5) — antrenman ekranına tek çağrıyla bağlanan,
 * kendi başına yeten parça. Yalnız sağlık modülü açık ve danışanın onayı hazır oluşluğu (`readiness`) ya
 * da ağrı takibini (`check_in`) kapsıyorsa ve antrenman yeni başlıyorsa (hiç set yok, hafifletilmemiş)
 * açılır; onay yoksa hiç görünmez, hiçbir şey yazılmaz. Tek ekran, "Bugün atla" ile geçilir; cevaplandığı
 * ya da geçildiği antrenmanda yeniden sorulmaz.
 *
 * - Girdi (`GET /api/me/check-in`) Bugün'de çekilip telefonda saklanır: sheet ağ beklemeden açılır, arkada
 *   tazelenir. Çevrimdışı ve önbelleksizse yoklama bu antrenmanda sorulmaz.
 * - "Başla": ağrı kuralı bugünün planına uygulanır (`adjustDay`); kırmızı bayrakta ya da kola/bacağa
 *   yayılan semptomda "Bugün yük yok" ekranı ve antrenman başlamaz. Hazır oluşluk 60'ın altındaysa önce
 *   "Hacmi hafifletelim mi?": Evet yalnız bugünün planını hafifletir (−%15, 3 ve üstü sette son set düşer).
 * - Plan ve seans belgesi telefonda değişir (`onApply`): seansa yalnız nötr `adjust: "lighter"` ve
 *   `lighter` bildirimi; kendi başına gönderilmez, ilk set yazımına biner (dosya ilk sette oluşur).
 * - Cevaplar `POST /api/me/check-in` ile `health.json`'a (sunucu onayı yeniden denetler); gönderilemezse
 *   telefonda bekler, bağlantı gelince gider.
 * - Açıklık ekrana bildirilir (`onOpenChange`): sheet açıkken listeden geri tuşu "Ara verilsin mi?" sormaz, ekran işareti
 *   geri koyup sheet'i kapatır (`ref.close()`, Android'in geri hareketiyle aynı yol: soruda kapatmak, öteki adımlarda
 *   adımın çıkışı).
 */
export function StartCheck({
  clientId,
  local,
  onApply,
  onLeave,
  onOpenChange: reportOpen,
  ref,
}: {
  clientId: string;
  local: LocalWorkout;
  /** Bugüne göre ayarlanan plan ve belge (telefonda saklanır). */
  onApply: (next: LocalWorkout) => void;
  /** "Bugün yük yok": antrenman başlamadan Bugün'e dönülür. */
  onLeave: (message: string, kind?: 'success' | 'info') => void;
  /** Sheet açıldı ya da kapandı (parça kapanınca da false). */
  onOpenChange?: (open: boolean) => void;
  ref?: Ref<StartCheckHandle>;
}) {
  const [context, setContext] = useState<CheckInResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('ask');
  const [answers, setAnswers] = useState<StartAnswers>({});
  const [outcome, setOutcome] = useState<StartOutcome | null>(null);
  const latest = useRef(local);
  // Soruda kaydırarak kapattı: bu açılışta yeniden açılmaz (önbellekten açıldıysa taze girdi gelince de).
  const dismissed = useRef(false);
  const sessionId = local.doc.id;

  useEffect(() => {
    latest.current = local;
  });

  // Ekran açıklığı izler; parça kapanırsa (ekran iskelete döndü, "Antrenmanı değiştir") açık kalmış sayılmasın.
  useEffect(() => {
    reportOpen?.(open);
    return () => reportOpen?.(false);
  }, [open, reportOpen]);

  // Antrenman başına bir kez: yeni başlıyorsa ve sorulmadıysa girdi (önce telefondaki, sonra taze).
  useEffect(() => {
    void flushCheckIns(clientId);
    if (!isFreshStart(latest.current.doc) || checkAsked(clientId, sessionId)) return;
    dismissed.current = false;
    const controller = new AbortController();
    const show = (data: CheckInResponse) => {
      const current = latest.current;
      if (current.doc.id !== sessionId || !isFreshStart(current.doc) || checkAsked(clientId, sessionId)) return;
      setContext(data);
      if (!dismissed.current) setOpen(asksAnything(data.parts));
    };
    const cached = readCheckCache(clientId);
    if (cached) show(cached.data);
    fetchCheckContext(clientId, controller.signal)
      .then(show)
      .catch(() => undefined);
    return () => controller.abort();
  }, [clientId, sessionId]);

  const finish = () => {
    markCheckAsked(clientId, sessionId);
    setOpen(false);
  };

  const skip = () => finish();

  const apply = (result: StartOutcome, lighten: boolean) => {
    if (!context) return finish();
    const current = latest.current;
    const adjusted = adjustDay(current.plan, { outcome: result, lighten, mode: context.mode });
    // Plan satır değişmese de değişebilir: hazır oluşluk düşükse set artışı önerisi düşer (§5.6).
    if (adjusted.changed.length > 0 || adjusted.day !== current.plan) {
      // Yalnız telefonda: belge ilk set yazımıyla gider (boş antrenman dosyası açılmasın).
      const doc = adjusted.lighter ? withLighter(current.doc, new Date().toISOString()) : current.doc;
      onApply({ ...current, doc, plan: adjusted.day });
    }
    const body = startCheckInBody({ parts: context.parts, answers, sessionId, adjustReason: adjusted.adjustReason });
    if (body) {
      queueCheckIn(clientId, body);
      void flushCheckIns(clientId);
    }
    finish();
    if (adjusted.lighter) toast.success(adjusted.adjustReason === 'pain' ? 'Ağrına göre bugünkü plan hafifletildi.' : 'Bugünkü plan hafifletildi.');
    else if (adjusted.changed.length > 0) toast('Ağrına göre bugün artış yok.');
  };

  const begin = () => {
    if (!context || !canBegin(context.parts, answers)) return;
    const result = evaluateStart({ context, answers });
    setOutcome(result);
    if (result.stop) setStep('stop');
    else if (result.low) setStep('lighten');
    else apply(result, false);
  };

  const stop = () => {
    // Antrenman başlamadığı için yoklama bir antrenmana bağlanmaz; PT kırmızı bayrağı görür (onay sürdükçe).
    const body = context ? startCheckInBody({ parts: context.parts, answers }) : null;
    if (body) {
      queueCheckIn(clientId, body);
      void flushCheckIns(clientId);
    }
    finish();
    onLeave('Bugün yük yok. Antrenörüne haber ver.', 'info');
  };

  const onOpenChange = (next: boolean, details: { reason: string }) => {
    if (next) return;
    // Soruda aşağı kaydırma (ya da ekran okuyucunun gizli "Kapat"ı) yalnız kapatır: cevap da atlama da
    // sayılmaz, yoklama bir sonraki açılışta yeniden sorulur. Öteki adımlar sürüklenmez; seçim düğmelerle.
    // Android'in geri hareketi (`close-watcher`) de kaydırma gibi.
    if (step === 'ask' && (details.reason === 'swipe' || details.reason === 'close-press' || details.reason === 'close-watcher')) {
      dismissed.current = true;
      setOpen(false);
      return;
    }
    // Escape: adımın geri çıkışı.
    if (step === 'stop') stop();
    else if (step === 'lighten' && outcome) apply(outcome, false);
    else skip();
  };

  // Geri tuşu (iPhone Safari'nin kenar kaydırması, masaüstünün geri düğmesi) Android'in geri hareketi gibi: soruda
  // kapatmak "atla" sayılmaz, yoklama bir sonraki açılışta yeniden sorulur.
  useImperativeHandle(ref, () => ({ close: () => onOpenChange(false, { reason: 'close-watcher' }) }));

  if (!context) return null;
  const { parts } = context;
  const set = (patch: Partial<StartAnswers>) => setAnswers((current) => ({ ...current, ...patch }));
  const setReadiness = (key: keyof Readiness, value: number | undefined) =>
    setAnswers((current) => ({ ...current, readiness: { ...current.readiness, [key]: value } }));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DrawerContent showCloseButton={false} swipeable={step === 'ask'} className="gap-0">
        {step === 'ask' ? (
          <>
            <DrawerHeader className="gap-1 pt-5">
              <DrawerTitle className="text-lg font-semibold">Bugün nasıl hissediyorsun?</DrawerTitle>
              <DrawerDescription>Sağlık onayın olduğu için soruluyor; cevapların yalnız sağlık kaydına yazılır. İstersen bugün atla.</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-2">
              {parts.readiness
                ? READINESS_KEYS.map((key) => {
                    const { question, answers: names } = READINESS_QUESTIONS[key];
                    return (
                      <ScaleField
                        key={key}
                        id={`readiness-${key}`}
                        label={question}
                        values={FIVE}
                        columns={5}
                        value={answers.readiness?.[key]}
                        onChange={(value) => setReadiness(key, value)}
                        describe={(value) => `${value} · ${names[value - 1] ?? ''}`}
                        ends={[names[0], names[4]]}
                      />
                    );
                  })
                : null}
              {parts.pain ? (
                <>
                  {parts.readiness ? <p className="border-t pt-4 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Ağrı</p> : null}
                  <ScaleField
                    id="pain-baseline"
                    label="Son 24 saatte ağrın ne kadardı?"
                    values={ELEVEN}
                    columns={6}
                    value={answers.painBaseline}
                    onChange={(value) => set({ painBaseline: value })}
                    describe={painText}
                    ends={[painText(0), painText(10)]}
                  />
                  {context.previous ? (
                    <ChoiceField
                      id="pain-returned"
                      label="Geçen antrenmandan sonraki ağrın ertesi sabah her zamanki düzeyine döndü mü?"
                      inline
                      choices={[
                        ['yes', 'Evet, her zamanki gibi'],
                        ['no', 'Hayır, daha fazlaydı'],
                      ]}
                      value={answers.returnedToBaseline === undefined ? undefined : answers.returnedToBaseline ? 'yes' : 'no'}
                      onChange={(value) => set({ returnedToBaseline: value === undefined ? undefined : value === 'yes' })}
                    />
                  ) : null}
                  <ChoiceField
                    id="pain-direction"
                    label="Ağrın ya da uyuşman nasıl değişiyor?"
                    hint="Varsa seç."
                    choices={Object.entries(DIRECTION_CHOICES) as [keyof typeof DIRECTION_CHOICES, string][]}
                    value={answers.symptomDirection}
                    onChange={(value) => set({ symptomDirection: value })}
                  />
                  <ChoiceField
                    id="pain-irritability"
                    label="Ağrın ne kadar kolay tetikleniyor?"
                    hint="Varsa seç."
                    choices={Object.entries(IRRITABILITY_CHOICES) as [keyof typeof IRRITABILITY_CHOICES, string][]}
                    value={answers.irritability}
                    onChange={(value) => set({ irritability: value })}
                  />
                  <ChoiceField
                    id="pain-red-flag"
                    label="Bunlardan biri yeni mi başladı?"
                    hint="Her antrenmanda sorulur; “Hayır” da bir cevaptır."
                    choices={Object.entries(RED_FLAG_CHOICES) as [keyof typeof RED_FLAG_CHOICES, string][]}
                    value={answers.redFlag}
                    onChange={(value) => set({ redFlag: value })}
                  />
                </>
              ) : null}
            </div>
            <DrawerFooter className="border-t pt-3">
              <Button size="lg" className="h-14 w-full text-base" disabled={!canBegin(parts, answers)} onClick={begin}>
                Başla
              </Button>
              <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={skip}>
                Bugün atla
              </Button>
            </DrawerFooter>
          </>
        ) : step === 'lighten' ? (
          <>
            <DrawerHeader className="gap-1.5 pt-5">
              <DrawerTitle className="text-lg font-semibold">Hacmi hafifletelim mi?</DrawerTitle>
              <DrawerDescription className="tabular-nums">
                Hazır oluşluğun {formatNumber(outcome?.score ?? 0)}/100. Bugün ağırlıklar yaklaşık %15 az, 3 ve üstü setli harekette bir set eksik
                olur. Yalnız bugünün planı değişir; antrenörüne &quot;hafifletildi&quot; diye bildirilir.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="pt-3">
              <Button size="lg" className="h-14 w-full text-base" onClick={() => outcome && apply(outcome, true)}>
                Evet, hafiflet
              </Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => outcome && apply(outcome, false)}>
                Planı koru
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader className="gap-1.5 pt-5">
              <WarningCircle weight="fill" className="mb-1 size-10 text-destructive" aria-hidden />
              <DrawerTitle className="text-lg font-semibold">Bugün yük yok</DrawerTitle>
              <DrawerDescription>{stopText(answers)}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="pt-3">
              <Button size="lg" className="h-14 w-full text-base" onClick={stop}>
                Bugün&apos;e dön
              </Button>
              <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => setStep('ask')}>
                Cevaplarımı düzelt
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
