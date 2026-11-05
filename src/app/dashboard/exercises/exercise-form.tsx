"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Field as FormField,
  FieldArray,
  Form,
  getDeepError,
  getInput,
  insert,
  move,
  remove,
  setInput,
  useForm,
} from "@formisch/react";
import { Heartbeat, Trash, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Plus } from "@/components/line-icons";
import { SortableList } from "@/components/list/sortable-list";
import { ToggleTiles } from "@/components/toggle-tiles";
import { SwipeRow, deleteAction } from "@/components/swipe/swipe-row";
import { showUndoToast } from "@/components/undo-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GroupedSelect, LabeledSelect } from "@/components/labeled-select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { VideoEmbed } from "@/components/video-embed";
import { MuscleMap } from "@/components/muscle-map/muscle-map";
import { MedicalFields } from "./medical-fields";
import { LibraryImpactNote, LoadFields } from "./load-fields";
import { sameDevice, sameRule, toExercisePayload } from "./exercise-form-logic";
import { TOUCH_TARGETS } from "./touch-targets";
import { patternLabels } from "@/lib/alternatives";
import { attachmentChoices } from "@/lib/catalog-refs";
import { deviceKindLabels, DEVICE_KINDS, KIND_EQUIPMENT } from "@/lib/device-loads";
import { gripLabels, gripWidthLabels } from "@/lib/grips";
import type { Attachment } from "@/lib/schemas/attachment";
import type { Device } from "@/lib/schemas/device";
import { isBodyMuscle, roleLabels, type MuscleRole } from "@/lib/muscles";
import { roleLegend, roleMarks } from "@/lib/muscle-tiers";
import type { DeepMuscle } from "@/lib/deep-muscles";
import {
  defaultRule,
  EQUIPMENT_LOAD_DEFAULTS,
  progressionOf,
  type ProgressionRule,
} from "@/lib/progression";
import { ApiError, fetchJson } from "@/lib/query/errors";
import { applyFieldErrors } from "@/lib/query/field-errors";
import { useServiceMutation } from "@/lib/query/use-service";
import {
  categoryLabels,
  equipmentLabels,
  MUSCLES,
  muscleLabels,
  exerciseFormSchema,
  type Exercise,
  type ExerciseInput,
  type Muscle,
} from "@/lib/schemas/exercise";
import { parseVideoUrl, videoUrl } from "@/lib/video";
import { useLocale, useMessages } from '@/i18n/client';
import { lower } from '@/i18n/text';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';
import { libraryValidationMessages } from '@/i18n/messages/library-validation';
import { commonMessages } from '@/i18n/messages/common';

/** Zorunlu alan işareti: görünen yıldız, ekran okuyucuya "zorunlu". */
function RequiredMark() {
  const t = useMessages(ptLibraryMessages).exerciseForm;
  return (
    <>
      <span aria-hidden className="-ml-1 text-destructive">*</span>
      <span className="sr-only">{t.required}</span>
    </>
  );
}

/** Formun başlangıcı: yeni egzersizde hareket kalıbı boş gelir, seçilmeden kaydedilmez. */
type FormStart = Omit<ExerciseInput, "pattern"> & {
  pattern?: ExerciseInput["pattern"];
};

const BLANK: FormStart = {
  title: "",
  description: "",
  cues: [""],
  category: "compound",
  trackingType: "weight_reps",
  equipment: "barbell",
  primaryMuscles: [],
  stabilizerMuscles: [],
  secondaryMuscles: [],
  ...EQUIPMENT_LOAD_DEFAULTS.barbell,
  progression: defaultRule("compound", "weight_reps"),
  videoUrl: "",
};

/** Formda gösterilecek muadil adayı (sunucuda sıralanır). */
export type AlternativeOption = { id: string; title: string; detail: string };

/**
 * Muadiller: PT'nin sabitledikleri. Egzersiz sayfasında "Senin seçtiklerin" olarak
 * en üstte çıkar; şablonda cihaz değişince önce bunlara bakılır. Sıra, seçim sırasıdır.
 */
function AlternativesField({
  options,
  pinned,
  onToggle,
}: {
  options: AlternativeOption[];
  pinned: string[];
  onToggle: (id: string) => void;
}) {
  const t = useMessages(ptLibraryMessages).exerciseForm;
  return (
    <FieldSet>
      <Field>
        <FieldDescription>
          {t.pinsHint}
        </FieldDescription>
        <ToggleTiles items={options} selected={pinned} onToggle={onToggle} max={12} />
      </Field>
    </FieldSet>
  );
}

/**
 * Düzenlemede kimlik forma girmez (şemada yok); video, yapıştırılan bağlantı olarak
 * gösterilir; kuralı olmayan egzersizde türünün varsayılan kuralı açık yazılır.
 */
function toInput({
  id: _id,
  video,
  alternatives: _alternatives,
  ...rest
}: Exercise): FormStart {
  return {
    ...rest,
    progression: progressionOf(rest),
    videoUrl: video ? videoUrl(video) : "",
  };
}

/**
 * Egzersiz ekleme/düzenleme formu — kendi sayfasında (modal değil, SPEC §6).
 * İpuçları `FieldArray` ile satır satır. Kaydedince PT'nin repo'sundaki
 * `data/exercises.json` güncellenir, liste `invalidate` ile tazelenir.
 */
export function ExerciseForm({
  editing,
  devices,
  attachments,
  alternativeOptions = [],
}: {
  editing: Exercise | null;
  /** Seçilebilir cihazlar (hazır katalog + PT'nin cihazları). */
  devices: Device[];
  /** Aparat havuzu; cihazın aparat kimlikleri buradan ada çevrilir. */
  attachments: Attachment[];
  /** Sabitlenebilecek muadiller (yalnız düzenlemede; yeni egzersizde henüz sıralanamaz). */
  alternativeOptions?: AlternativeOption[];
}) {
  const t = useMessages(ptLibraryMessages).exerciseForm;
  const common = useMessages(commonMessages);
  const locale = useLocale();
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  // Seçilebilir aparatlar: cihaza takılı olup havuzda duranlar (cihazsızda hiçbiri).
  const choicesFor = (deviceId: string | undefined) =>
    attachmentChoices(deviceId ? deviceById.get(deviceId) : undefined, attachmentById);
  const deviceGroups = DEVICE_KINDS.map((kind) => ({
    label: deviceKindLabels(locale)[kind],
    options: devices
      .filter((device) => device.kind === kind)
      .map((device) => ({ value: device.id, label: device.name })),
  })).filter((group) => group.options.length > 0);
  const router = useRouter();
  // Açılıştaki hâl: düzenlemede cihaz ya da kural değişirse şablon ve programlara etkisi söylenir.
  const [start] = useState(() => (editing ? toInput(editing) : BLANK));
  const form = useForm({ schema: exerciseFormSchema, initialInput: start });
  // Muadiller şemada yok; kendi ucundan yazılır (sıra korunur).
  const [pinned, setPinned] = useState<string[]>(editing?.alternatives ?? []);
  const togglePinned = (id: string) =>
    setPinned((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length >= 12 ? current : [...current, id],
    );
  const pinsChanged = pinned.join() !== (editing?.alternatives ?? []).join();

  const save = useServiceMutation({
    fn: async (values: ExerciseInput) => {
      const body = toExercisePayload(values, {
        editingId: editing?.id,
        attachmentIds: choicesFor(values.deviceId).map((item) => item.id),
      });
      const { id } = await fetchJson<{ id: string }>("/api/exercises", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Muadiller ayrı uçtan yazılır. Egzersiz kaydedildiyse buradaki hata kaydı geri almaz.
      if (!pinsChanged) return { id, pinsFailed: null };
      try {
        await fetchJson(`/api/exercises/${id}/alternatives`, {
          method: "PUT",
          body: JSON.stringify({ alternatives: pinned }),
        });
      } catch (error) {
        return { id, pinsFailed: error instanceof ApiError ? error.message : t.pinsFailed };
      }
      return { id, pinsFailed: null };
    },
    invalidate: [["exercises"]],
    notify: {
      success: editing ? t.updated : t.added,
    },
    onError: (error) => applyFieldErrors(form as never, error),
    // Yeni kayıtta sunucunun ürettiği kimlikle detay sayfasına geçilir.
    onSuccess: ({ id, pinsFailed }) => {
      if (pinsFailed) {
        toast.error(t.savedButPins(pinsFailed));
        router.push(`/dashboard/exercises/${id}/edit`);
      } else {
        router.push(`/dashboard/exercises/${id}`);
      }
      router.refresh();
    },
  });

  // Ekranda karşılığı olmayan bir doğrulama hatası kalırsa form sessizce gönderilmez;
  // bu özet o durumu görünür kılar.
  const hiddenError = getDeepError(form);
  // Kaydedilmemiş değişiklik varken sayfadan çıkış sorulur (şablon düzenleyiciyle aynı bileşen;
  // yerel taslak yok). Sabitlenen muadiller de kaydedilmemiş iştir.
  const guarded = (form.isDirty || pinsChanged) && !save.isPending && !save.isSuccess;

  return (
    <>
    <Form
      of={form}
      className={`flex flex-col gap-6 ${TOUCH_TARGETS}`}
      onSubmit={(values) =>
        save.mutateAsync(values as ExerciseInput).catch(() => undefined)
      }
    >
      <p className="text-sm text-muted-foreground">
        {t.requiredNote.lead}
        <span aria-hidden className="text-destructive">*</span>
        {t.requiredNote.tail}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t.moveTitle}</CardTitle>
          <CardDescription>{t.moveDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
          <FormField of={form} path={["title"]}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="title">
                  {t.nameLabel}
                  <RequiredMark />
                </FieldLabel>
                <Input
                  {...field.props}
                  id="title"
                  value={field.input ?? ""}
                  aria-required
                  aria-invalid={Boolean(field.errors) || undefined}
                />
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>

          <FormField of={form} path={["description"]}>
            {(field) => (
              <Field data-invalid={Boolean(field.errors) || undefined}>
                <FieldLabel htmlFor="description">{t.descriptionLabel}</FieldLabel>
                <Textarea
                  {...field.props}
                  id="description"
                  value={field.input ?? ""}
                  placeholder={t.descriptionPlaceholder}
                  rows={2}
                />
                <FieldError>{field.errors?.[0]}</FieldError>
              </Field>
            )}
          </FormField>

          </div>

          <div className="flex flex-col gap-5">
          <Field>
            <FieldLabel>{t.cuesLabel}</FieldLabel>
            <FieldArray of={form} path={["cues"]}>
              {(array) => (
                <div className="flex flex-col gap-2">
                  <SortableList
                    items={array.items}
                    keyOf={(item) => item}
                    nameOf={(item) => t.cueName(array.items.indexOf(item) + 1)}
                    label={t.cuesList}
                    className={array.items.length === 0 ? "hidden" : undefined}
                    onStep={(item, target) => {
                      const from = array.items.indexOf(item);
                      const to = target === "up" ? from - 1 : from + 1;
                      if (to >= 0 && to < array.items.length) move(form, { path: ["cues"], from, to });
                    }}
                    onTapItem={(item) => document.getElementById(`cue-${item}`)?.focus()}
                    onDrop={(item, over) =>
                      move(form, { path: ["cues"], from: array.items.indexOf(item), to: array.items.indexOf(over) })
                    }
                    renderItem={(item, slot) => {
                      const index = array.items.indexOf(item);
                      const removeCue = () => {
                        const value = getInput(form, { path: ["cues", index] }) ?? "";
                        remove(form, { path: ["cues"], at: index });
                        showUndoToast(t.cueDeleted, () =>
                          insert(form, { path: ["cues"], at: index, initialInput: value }),
                        );
                      };
                      // Tutamaç kaydırma satırının dışında: dokunma alanı kartın üstüne taşar (`SwipeRow` kırpar).
                      return (
                        <>
                        {slot.grabber}
                        <SwipeRow id={item} end={[deleteAction(removeCue)]}>
                          <div className="relative flex gap-2 rounded-lg border bg-card px-2 pt-3 pb-2">
                            <FormField of={form} path={["cues", index]}>
                              {(field) => (
                                <Input
                                  {...field.props}
                                  id={`cue-${item}`}
                                  value={field.input ?? ""}
                                  placeholder={t.cuePlaceholder}
                                  aria-label={t.cueName(index + 1)}
                                />
                              )}
                            </FormField>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="touch:size-11"
                              aria-label={t.cueRemove(index + 1)}
                              onClick={removeCue}
                            >
                              <Trash />
                            </Button>
                          </div>
                        </SwipeRow>
                        </>
                      );
                    }}
                  />
                  {array.items.length < 6 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        insert(form, { path: ["cues"], initialInput: "" })
                      }
                    >
                      <Plus data-icon="inline-start" />
                      {t.cueAdd}
                    </Button>
                  ) : null}
                </div>
              )}
            </FieldArray>
          </Field>

          <FormField of={form} path={["videoUrl"]}>
            {(field) => {
              const link = field.input?.trim() ?? "";
              const video = link ? parseVideoUrl(link) : null;
              // Tanınmayan bağlantı yazarken de hata olarak görünür; gönderimde şema aynı cümleyi söyler.
              const error = field.errors?.[0] ?? (link && !video ? libraryValidationMessages(locale).exerciseSchema.videoLink : null);
              return (
                <Field data-invalid={Boolean(error) || undefined}>
                  <FieldLabel htmlFor="videoUrl">{t.videoLabel}</FieldLabel>
                  <Input
                    {...field.props}
                    id="videoUrl"
                    inputMode="url"
                    autoComplete="off"
                    value={field.input ?? ""}
                    placeholder="https://www.youtube.com/watch?v=…"
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={error ? "videoUrl-error" : "videoUrl-hint"}
                  />
                  {error ? (
                    <FieldError id="videoUrl-error" className="flex items-start gap-1.5">
                      <WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      {error}
                    </FieldError>
                  ) : (
                    <FieldDescription id="videoUrl-hint">
                      {t.videoHint}
                    </FieldDescription>
                  )}
                  {video ? (
                    <VideoEmbed
                      provider={video.provider}
                      id={video.id}
                      title={t.videoPreview}
                    />
                  ) : null}
                </Field>
              );
            }}
          </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.gearTitle}</CardTitle>
          <CardDescription>{t.gearDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField of={form} path={["pattern"]}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="pattern">
                    {t.patternLabel}
                    <RequiredMark />
                  </FieldLabel>
                  <LabeledSelect
                    id="pattern"
                    value={field.input}
                    labels={patternLabels(locale)}
                    placeholder={t.pick}
                    onChange={(value) =>
                      setInput(form, { path: ["pattern"], input: value })
                    }
                  />
                  <FieldDescription>{t.patternHint}</FieldDescription>
                  <FieldError>{field.errors?.[0]}</FieldError>
                </Field>
              )}
            </FormField>
            <FormField of={form} path={["deviceId"]}>
              {(field) => (
                <Field data-invalid={Boolean(field.errors) || undefined}>
                  <FieldLabel htmlFor="deviceId">{t.deviceLabel}</FieldLabel>
                  <GroupedSelect
                    id="deviceId"
                    value={field.input ?? ""}
                    groups={deviceGroups}
                    empty={t.noDevice}
                    onChange={(value) => {
                      setInput(form, { path: ["deviceId"], input: value || undefined });
                      // Ekipman cihazın türünden gelir.
                      const device = deviceById.get(value);
                      if (device) setInput(form, { path: ["equipment"], input: KIND_EQUIPMENT[device.kind] });
                      // Aparat yeni cihazda yoksa seçim düşer (seçici gizlenince değer formda kalmasın).
                      const attachmentId = getInput(form, { path: ["attachmentId"] });
                      if (attachmentId && !choicesFor(value || undefined).some((item) => item.id === attachmentId)) {
                        setInput(form, { path: ["attachmentId"], input: undefined });
                      }
                    }}
                  />
                  <FieldDescription>{t.deviceHint}</FieldDescription>
                  {/* Sunucunun alan hatası: cihaz silinmiş ya da dosyada okunamıyor. */}
                  <FieldError>{field.errors?.[0]}</FieldError>
                  {editing && !sameDevice(field.input, start.deviceId) ? <LibraryImpactNote /> : null}
                </Field>
              )}
            </FormField>
            {/* Aparat yalnız cihazına aparat takılıysa görünür; adlar havuzdan gelir. */}
            <FormField of={form} path={["deviceId"]}>
              {(deviceField) => {
                const options = choicesFor(deviceField.input).map((found) => ({ value: found.id, label: found.name }));
                if (options.length === 0) return <></>;
                return (
                  <FormField of={form} path={["attachmentId"]}>
                    {(field) => (
                      <Field data-invalid={Boolean(field.errors) || undefined}>
                        <FieldLabel htmlFor="attachmentId">{t.attachmentLabel}</FieldLabel>
                        <GroupedSelect
                          id="attachmentId"
                          value={field.input ?? ""}
                          groups={[{ label: t.attachmentsGroup, options }]}
                          empty={t.notSpecified}
                          onChange={(value) =>
                            setInput(form, {
                              path: ["attachmentId"],
                              input: (value || undefined) as ExerciseInput["attachmentId"],
                            })
                          }
                        />
                        <FieldDescription>
                          {t.attachmentHint}
                        </FieldDescription>
                        <FieldError>{field.errors?.[0]}</FieldError>
                      </Field>
                    )}
                  </FormField>
                );
              }}
            </FormField>
            <FormField of={form} path={["grip"]}>
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="grip">{t.gripLabel}</FieldLabel>
                  <GroupedSelect
                    id="grip"
                    value={field.input ?? ""}
                    groups={[
                      {
                        label: t.gripGroup,
                        options: Object.entries(gripLabels(locale)).map(([value, label]) => ({ value, label })),
                      },
                    ]}
                    empty={t.notSpecified}
                    onChange={(value) =>
                      setInput(form, { path: ["grip"], input: (value || undefined) as ExerciseInput["grip"] })
                    }
                  />
                </Field>
              )}
            </FormField>
            <FormField of={form} path={["gripWidth"]}>
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="gripWidth">{t.gripWidthLabel}</FieldLabel>
                  <GroupedSelect
                    id="gripWidth"
                    value={field.input ?? ""}
                    groups={[
                      {
                        label: t.widthGroup,
                        options: Object.entries(gripWidthLabels(locale)).map(([value, label]) => ({ value, label })),
                      },
                    ]}
                    empty={t.notSpecified}
                    onChange={(value) =>
                      setInput(form, { path: ["gripWidth"], input: (value || undefined) as ExerciseInput["gripWidth"] })
                    }
                  />
                </Field>
              )}
            </FormField>
            <FormField of={form} path={["equipment"]}>
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="equipment">{t.equipmentTypeLabel}</FieldLabel>
                  <LabeledSelect
                    id="equipment"
                    value={field.input}
                    labels={equipmentLabels(locale)}
                    onChange={(value) => {
                      setInput(form, { path: ["equipment"], input: value });
                      // Adım ve taban ekipmana bağlı; PT sonra değiştirebilir.
                      const load = EQUIPMENT_LOAD_DEFAULTS[value];
                      setInput(form, { path: ["loadStepKg"], input: load.loadStepKg });
                      setInput(form, { path: ["minLoadKg"], input: load.minLoadKg });
                    }}
                  />
                </Field>
              )}
            </FormField>
            <FormField of={form} path={["category"]}>
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="category">{t.categoryLabel}</FieldLabel>
                  <LabeledSelect
                    id="category"
                    value={field.input}
                    labels={categoryLabels(locale)}
                    onChange={(value) => {
                      const tracking = getInput(form, { path: ["trackingType"] }) ?? "weight_reps";
                      const current = getInput(form, { path: ["progression"] }) as
                        | ProgressionRule
                        | undefined;
                      const wasDefault = sameRule(
                        current,
                        defaultRule(field.input ?? "compound", tracking),
                      );
                      setInput(form, { path: ["category"], input: value });
                      // Elle ayarlanmış kurala dokunma; varsayılansa yeni türün varsayılanı gelsin.
                      if (wasDefault) {
                        setInput(form, {
                          path: ["progression"],
                          input: defaultRule(value, tracking),
                        });
                      }
                    }}
                  />
                </Field>
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t.musclesTitle} <RequiredMark />
          </CardTitle>
          <CardDescription>
            {t.musclesDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField of={form} path={["primaryMuscles"]}>
            {(primaryField) => (
              <FormField of={form} path={["secondaryMuscles"]}>
                {(secondaryField) => (
                  <FormField of={form} path={["stabilizerMuscles"]}>
                    {(stabilizerField) => (
                    <FormField of={form} path={["activationTargets"]}>
                    {(deepField) => {
                      // Her kas tek seviyede: hedef > yardımcı > dengeleyici.
                      const primary = (primaryField.input ?? []) as Muscle[];
                      const secondary = ((secondaryField.input ?? []) as Muscle[]).filter(
                        (muscle) => !primary.includes(muscle),
                      );
                      const stabilizer = (
                        (stabilizerField.input ?? []) as Muscle[]
                      ).filter(
                        (muscle) => !primary.includes(muscle) && !secondary.includes(muscle),
                      );
                      const roleOf = (muscle: Muscle): MuscleRole | null =>
                        primary.includes(muscle)
                          ? "primary"
                          : secondary.includes(muscle)
                            ? "secondary"
                            : stabilizer.includes(muscle)
                              ? "stabilizer"
                              : null;

                      const worked = {
                        primaryMuscles: primary,
                        secondaryMuscles: secondary,
                        stabilizerMuscles: stabilizer,
                      };

                      // Kaslar sabit sırada saklanır.
                      const save = (next: Record<MuscleRole, Muscle[]>) => {
                        setInput(form, {
                          path: ["primaryMuscles"],
                          input: MUSCLES.filter((muscle) => next.primary.includes(muscle)),
                        });
                        setInput(form, {
                          path: ["secondaryMuscles"],
                          input: MUSCLES.filter((muscle) => next.secondary.includes(muscle)),
                        });
                        setInput(form, {
                          path: ["stabilizerMuscles"],
                          input: MUSCLES.filter((muscle) => next.stabilizer.includes(muscle)),
                        });
                      };
                      const setRole = (muscle: Muscle, role: MuscleRole | null) => {
                        const without = (list: Muscle[]) => list.filter((item) => item !== muscle);
                        const next = {
                          primary: without(primary),
                          secondary: without(secondary),
                          stabilizer: without(stabilizer),
                        };
                        if (role) next[role] = [...next[role], muscle];
                        save(next);
                      };
                      // Dokunuş sırası: boş → hedef → yardımcı → dengeleyici → boş.
                      const NEXT: Record<MuscleRole | "none", MuscleRole | null> = {
                        none: "primary",
                        primary: "secondary",
                        secondary: "stabilizer",
                        stabilizer: null,
                      };
                      const cycle = (muscle: Muscle) => setRole(muscle, NEXT[roleOf(muscle) ?? "none"]);

                      const errors =
                        primaryField.errors ?? secondaryField.errors ?? stabilizerField.errors;
                      // Derin kaslar haritanın altındaki bölümde seçilir; hacme sayılmaz.
                      const deepSelected = (deepField.input ?? []).filter(
                        (item): item is DeepMuscle => typeof item === "string",
                      );
                      const toggleDeep = (muscle: DeepMuscle) =>
                        setInput(form, {
                          path: ["activationTargets"],
                          input: deepSelected.includes(muscle)
                            ? deepSelected.filter((item) => item !== muscle)
                            : [...deepSelected, muscle],
                        });
                      const bodySelected = [...primary, ...secondary, ...stabilizer].filter(
                        isBodyMuscle,
                      );

                      return (
                        <Field data-invalid={Boolean(errors) || undefined}>
                          <FieldDescription>
                            {t.musclesHint}
                          </FieldDescription>
                          <MuscleMap
                            layout="split"
                            marks={roleMarks(worked)}
                            legend={roleLegend(worked, locale)}
                            onRemoveRow={(muscle) => setRole(muscle as Muscle, null)}
                            deep={{ selected: deepSelected, onToggle: toggleDeep }}
                            selected={bodySelected}
                            onToggle={cycle}
                            describe={(muscle) => {
                              const role = roleOf(muscle);
                              const next = NEXT[role ?? "none"];
                              return t.describeMuscle(
                                muscleLabels(locale)[muscle],
                                role ? lower(locale, roleLabels(locale)[role]) : null,
                                next ? lower(locale, roleLabels(locale)[next]) : null,
                              );
                            }}
                            hint={t.mapHint}
                            bodyClassName="h-[22rem] lg:h-[26rem]"
                            label={t.mapLabel}
                          />
                          <Toggle
                            variant="outline"
                            size="sm"
                            className="self-start"
                            pressed={primary.includes("cardio")}
                            onPressedChange={(pressed) =>
                              setRole("cardio", pressed ? "primary" : null)
                            }
                          >
                            <Heartbeat data-icon="inline-start" />
                            {t.cardio}
                          </Toggle>
                          <FieldError>{errors?.[0] ?? deepField.errors?.[0]}</FieldError>
                        </Field>
                      );
                    }}
                    </FormField>
                    )}
                  </FormField>
                )}
              </FormField>
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.loadTitle}</CardTitle>
          <CardDescription>{t.loadDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoadFields form={form} deviceById={deviceById} startRule={editing ? start.progression : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.medicalTitle}</CardTitle>
          <CardDescription>{t.medicalDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <MedicalFields form={form} />
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.altTitle}</CardTitle>
            <CardDescription>{t.altDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {alternativeOptions.length > 0 ? (
              <AlternativesField options={alternativeOptions} pinned={pinned} onToggle={togglePinned} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t.altNone}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}


      {hiddenError ? (
        <Alert variant="destructive">
          <WarningCircle />
          <AlertTitle>{t.errorTitle}</AlertTitle>
          <AlertDescription>{hiddenError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={
                editing
                  ? `/dashboard/exercises/${editing.id}`
                  : "/dashboard/exercises"
              }
            />
          }
        >
          {common.actions.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? common.actions.saving : common.actions.save}
        </Button>
      </div>
    </Form>
    <UnsavedChangesGuard
      active={guarded}
      description={t.guardDescription}
      onLeave={() => undefined}
    />
    </>
  );
}
