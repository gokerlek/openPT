import { plural, type Shape } from '../../define.ts';
import { lowerFirst } from '../../text.ts';
import type { ConstraintRegion, ConstraintSide } from '../../../lib/constraints.ts';
import type { HealthField } from '../../../lib/schemas/client.ts';
import type tr from './tr.ts';

/**
 * Clinical copy (regions, movements to avoid, severities, red flags, emergency referral) needs review by a qualified
 * person (plan §8.9). Constraint log lines are stored in the writer's language.
 */

type Where = { region: ConstraintRegion; side?: ConstraintSide | undefined };

const regions = {
  neck: 'Neck',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist_hand: 'Wrist',
  upper_back: 'Upper back',
  lower_back: 'Lower back',
  hip: 'Hip',
  knee: 'Knee',
  ankle_foot: 'Ankle',
  other: 'Somewhere else',
};

/** Paired regions in the plural ("both knees"). */
const PLURAL: Partial<Record<ConstraintRegion, string>> = {
  shoulder: 'shoulders',
  elbow: 'elbows',
  wrist_hand: 'wrists',
  hip: 'hips',
  knee: 'knees',
  ankle_foot: 'ankles',
};

/** "your left knee", "both your knees", "your lower back", "this area". */
function yourRegion(where: Where, _form: 'gen' | 'acc' | 'dat'): string {
  if (where.region === 'other') return 'this area';
  const name = regions[where.region].toLowerCase();
  if (!where.side) return `your ${name}`;
  if (where.side === 'both') return `both your ${PLURAL[where.region] ?? name}`;
  return `your ${where.side} ${name}`;
}

/** "the left knee you reported" ("the area you reported" when the region has no name). */
function reportedArea(label: string, what: string): string {
  return label === regions.other ? `the area you ${what}` : `the ${lowerFirst('en', label)} you ${what}`;
}

const en: Shape<typeof tr> = {
  constraints: {
    regions,
    regionWithSide: (side, region) =>
      side === 'both' ? `Both ${PLURAL[region] ?? regions[region].toLowerCase()}` : `${side === 'left' ? 'Left' : 'Right'} ${regions[region].toLowerCase()}`,
    yourRegion,
    sides: { left: 'Left', right: 'Right', both: 'Both sides' },
    types: {
      injury: 'Injury',
      condition: 'Condition',
      post_op: 'Post-operative',
      limitation: 'Movement limitation',
    },
    typeClient: {
      injury: 'A new injury',
      condition: 'A long-standing problem',
      post_op: 'I had surgery',
      limitation: 'My doctor told me to avoid something',
    },
    severities: { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' },
    severityDescriptions: {
      mild: "Doesn't affect training",
      moderate: 'Makes some exercises hard',
      severe: 'Affects daily life',
    },
    diagnosisSources: {
      clinician: 'Physician or physiotherapist',
      client: "Client's own report",
    },
    clearanceBases: {
      client_report: "Client's own report",
      written_report: 'Written report',
    },
    grafts: { hamstring: 'Hamstring', patellar_tendon: 'Patellar tendon', other: 'Other' },
    stages: {
      1: '1 · isometric',
      2: '2 · isotonic',
      3: '3 · energy storage',
      4: '4 · return to sport',
    },
    triggers: {
      squat: 'Squatting',
      overhead: 'Raising my arm overhead',
      bend: 'Bending forward',
      jump: 'Jumping',
      lean_back: 'Leaning back',
    },
    onsetChoices: { week: 'This week', month: 'This month', months: '1–6 months', longer: 'Longer' },
    avoid: {
      deep_knee_flexion: 'Deep knee flexion (over 90°)',
      knee_end_extension_open: 'Open-chain end-range knee extension',
      deep_hip_flexion: 'Deep hip flexion (over 90°)',
      overhead: 'Arm overhead (over 90°)',
      abduction_external_rotation: '90° abduction + end-range external rotation',
      behind_body: 'Elbow behind the body',
      ir_under_load: 'Internal rotation under load',
      loaded_horizontal_adduction: 'Resisted horizontal adduction',
      loaded_spinal_flexion: 'Loaded spinal flexion',
      spinal_flexion_rotation: 'Spinal flexion + rotation',
      loaded_spinal_extension: 'Loaded spinal extension',
      high_axial_load: 'High axial load (bar on the back)',
      high_shear: 'High shear force',
      ballistic: 'Jumping / ballistic',
      forward_bend: 'Forward bending / lifting from the floor',
    },
    inlineList: (labels) => labels.map((label) => lowerFirst('en', label)).join(', '),
    approxOnset: (text) => `about ${text}`,
    meta: (type, severity, onset) =>
      [type, severity ? lowerFirst('en', severity) : null, onset ? `onset ${onset}` : null].filter(Boolean).join(' · '),
    fallbackName: 'Limitation',
    emergency: 'Urgent: refer the client to the emergency department today.',
    reportSafety: {
      urgent:
        'If you have a new change in urination or bowel movements, numbness in the groin, or new loss of strength, go to the emergency department without waiting.',
      other:
        "If you have pain that wakes you at night, can't put weight on it after a fall or a blow, or a joint that swells quickly or locks, see a health professional before training.",
    },
    afterReport: {
      serious:
        "Sent to your trainer. Until your trainer has looked at it, don't do exercises that strain this area; if the pain affects your daily life, see a health professional.",
      other:
        'Sent to your trainer. Until your trainer has looked at it, be careful with exercises that strain it; if one causes pain during your workout, skip it or choose an alternative from the ⋯ menu.',
    },
    errors: {
      notFound: 'Limitation not found; it may have been deleted.',
      changed: 'This limitation changed in the meantime. Refresh the page and check again.',
      side: 'Choose a side.',
      diagnosisUnknown: 'The diagnosis is not in the list.',
      diagnosisSource: 'Choose the source of the diagnosis.',
      findingUnknown: 'The finding is not in the list.',
      tooMany: (max) => `At most ${max} limitations can be kept; you can delete closed ones.`,
      tooManyActive: (max) => `At most ${max} limitations can be active; close one.`,
      idConflict: 'ID conflict; try again.',
      decided: 'A decision has already been made on this report.',
      referRedFlagOnly: 'A referral can only be recorded for a red-flag diagnosis.',
      clearRedFlagOnly: 'An opinion can only be recorded for a red-flag diagnosis.',
      overrideInactive: 'Permission can only be given for an active limitation.',
      overrideEmergency: 'Permission cannot be given for this limitation.',
      overrideAwaiting: "Permission cannot be given until the health professional's opinion is recorded.",
      tooManyOverrides: (max) => `At most ${max} permissions can be kept.`,
      overrideNotFound: 'Permission not found; it may have been removed.',
      reportSide: 'Choose which side.',
      tooManyReports: (max) => `You have ${max} reports your trainer hasn't looked at yet; wait for those first.`,
      reviewed: 'Your trainer has looked at this report; you can now say "Got worse" or "Got better".',
      inactive: 'This limitation is no longer active.',
      severityNotHigher: 'Severity must be higher than the current one.',
    },
    log: {
      avoidSuffix: (list) => ` · avoid: ${list}`,
      added: (region, avoidSuffix) => `${region} added${avoidSuffix}`,
      confirmed: (region, avoidSuffix) => `${region} confirmed${avoidSuffix}`,
      seenUnfiltered: (region) => `${region} seen (no filter)`,
      edited: (region, changes) => `${region}: ${changes.join(', ')}`,
      declined: (region) => `${region} report not taken as a limitation`,
      resolved: (region) => `${region} closed`,
      resolvedByClient: (region) => `${region} closed (client said it got better)`,
      reopened: (region) => `${region} reopened`,
      referred: (region) => `${region}: referred to a health professional`,
      cleared: (region, basis) => `${region}: opinion received (${lowerFirst('en', basis)})`,
      removed: (region) => `${region} deleted`,
      overrideAdded: (region, title) => `${region}: permission given · ${title}`,
      overrideRemoved: (region, title) => `${region}: permission removed · ${title}`,
      reported: (region, severity) => `${region} reported${severity ? ` (${lowerFirst('en', severity)})` : ''}`,
      reportEdited: (region) => `${region} report corrected`,
      withdrawn: (region) => `Report withdrawn: ${region}`,
      worsened: (region, from, to) => `${region}: ${from ? `${lowerFirst('en', from)} → ` : ''}${lowerFirst('en', to)} (client)`,
      improved: (region) => `${region}: said it got better (client)`,
      changes: {
        region: (region) => `region ${lowerFirst('en', region)}`,
        type: (type) => `type ${lowerFirst('en', type)}`,
        severity: (from, to) => `${from ? lowerFirst('en', from) : 'no severity'} → ${to ? lowerFirst('en', to) : 'no severity'}`,
        diagnosisChanged: 'diagnosis changed',
        diagnosisRemoved: 'diagnosis removed',
        findingChanged: 'finding changed',
        findingRemoved: 'finding removed',
        avoid: (list) => `avoid: ${list}`,
        noAvoid: 'nothing to avoid',
        clientNote: 'note to client',
        note: 'note',
        details: 'details',
        onset: 'onset',
      },
    },
  },
  care: {
    reasons: {
      avoid: (label, avoid) => `${label}: ${lowerFirst('en', avoid)}`,
      fallback: (label, avoid) => `${label}: tags missing; may involve ${lowerFirst('en', avoid)}`,
      referral: (label) => `${label}: awaiting a health professional's opinion`,
      severe: (label) => `${label}: client said it got much worse (severe); use caution until you review it`,
      reportTrigger: (label, trigger) => `Client reported (decision pending): ${label} · ${lowerFirst('en', trigger)}`,
      reportSevere: (label) => `Client reported (decision pending): ${label} · severe; this exercise works the area`,
    },
    row: {
      title: (label) => `Note: ${label}`,
      avoidOwn: (where) => `This exercise isn't recommended for ${yourRegion(where, 'gen')} right now. Skip it today or ask your trainer.`,
      avoid: (where) => `Your trainer will change this exercise for ${yourRegion(where, 'gen')}. For today, pick an alternative from 'Swap'.`,
      referral: "Your trainer is waiting for a health professional's opinion about this area. If it causes pain, skip the exercise.",
      report: (label) => `This may strain ${reportedArea(label, 'reported')}; if it causes pain, skip it.`,
      severe: (label) =>
        `This may strain ${reportedArea(label, 'said got worse')}. Until your trainer looks at it, skip it if it causes pain or tap Swap.`,
      noteOwn: (where) => `Be careful with ${yourRegion(where, 'gen')}; stay in a pain-free range and skip the exercise if pain increases.`,
      note: (where) =>
        `Your trainer planned this exercise with ${yourRegion(where, 'acc')} in mind. Stay in a pain-free range; if pain increases, skip the exercise or tap Swap.`,
    },
    line: {
      caution: (label, title) => `Caution (${lowerFirst('en', label)}): ${title}`,
      swap: (label, title) => `Swap (${lowerFirst('en', label)}): ${title}`,
      notRecommended: (label, title) => `Not recommended (${lowerFirst('en', label)}): ${title}`,
    },
    option: {
      caution: (label) => `Caution: ${lowerFirst('en', label)}`,
      reported: (label) => `Caution: ${reportedArea(label, 'reported')}`,
    },
    blocked: "This exercise isn't recommended for you right now; ask your trainer.",
    noConsent: "Limitations can't be used: the client hasn't given health consent.",
  },
  checkIn: {
    symptomDirections: {
      centralizing: 'Centralizing',
      stable: 'No change',
      peripheralizing: 'Spreading down (peripheralizing)',
    },
    irritability: {
      low: 'Low (intermittent, not easily provoked)',
      moderate: 'Moderate',
      high: 'High (constant, easily provoked)',
    },
    redFlags: {
      none: 'None',
      new_neuro_deficit: 'New numbness / loss of strength',
      bladder_bowel_change: 'Change in urination or bowel movements',
      night_pain: 'Pain that wakes you at night',
      new_trauma: 'New fall or blow',
    },
    toleranceModes: {
      pain_free: 'Pain-free (max 3/10)',
      pain_monitoring: 'Pain monitoring (max 5/10, tendinopathy)',
    },
    reasons: {
      redFlag: (flag) => `New red flag (${lowerFirst('en', flag)}): no load without a medical assessment.`,
      peripheralizing: 'Symptoms are spreading down (peripheralizing): loading stops; centralization comes first.',
      notBackToBaseline: "Pain from the previous session didn't return to baseline by the next morning: load is reduced by 15%.",
      peakOverCeiling: (peak, ceiling) => `Pain during the session ${peak}/10, ceiling ${ceiling}/10: load is reduced.`,
      painRisingWeekly: (before, after) => `Pain increased week over week (${before} → ${after}): no increase.`,
      highIrritability: "High irritability: don't increase the load; work isometrically and in a pain-free range.",
    },
  },
  exposureStages: {
    intro: 'Intro',
    novice: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
  record: {
    lock: (field, lock, label) => {
      const words = PART_WORDS[field];
      switch (lock) {
        case 'off':
          return {
            title: 'Health module is off',
            description: `“${label}” is health data; nothing is recorded while the module is off. Turn on the health module on the client's edit page and select “${label}”; once the client consents at their next sign-in, ${words.entry}.`,
          };
        case 'not_selected':
          return {
            title: `${label} not selected`,
            description: `The health module is on, but “${label}” isn't selected. Select it on the client's edit page; once the client consents to the new scope at their next sign-in, ${words.entry}.`,
          };
        case 'pending':
          return {
            title: "Waiting for the client's consent",
            description: `At their first sign-in the client will see what is recorded and consent to it. Until then, ${words.record} aren't saved and earlier records aren't shown.`,
          };
        case 'declined':
          return {
            title: "The client didn't consent",
            description: `The client didn't consent to health data being recorded; ${words.record} aren't saved and earlier records aren't shown. If they change their mind, they can consent from their own screen.`,
          };
        case 'outdated':
          return {
            title: 'Consent needs renewing',
            description: `The client's consent doesn't cover the current scope or wording of this part; they'll be asked again at their next sign-in. Until then, ${words.record} aren't saved and earlier records aren't shown.`,
          };
      }
    },
    cannotSave: (lockTitle) => `Can't save: ${lowerFirst('en', lockTitle)}.`,
    malformed: (path) => `${path} is not in the expected format.`,
    clientNotFound: 'Client not found.',
    measurementMissing: 'No measurements on this date; they may have been deleted.',
    measurementAlreadyDeleted: 'No measurements on this date; they may already have been deleted.',
  },
  api: {
    forbidden: "You don't have permission to do this.",
    notFound: 'Not found.',
    invalid: 'Check the details.',
  },
  validation: {
    isoDate: 'Date must be YYYY-MM-DD.',
    calendarDate: 'Not a real calendar date.',
    number: 'Enter a number.',
    integer: 'Enter a whole number.',
    min: (min) => `At least ${min}.`,
    max: (max) => `At most ${max}.`,
    nonNegative: "Can't be negative.",
    maxMinutes: (max) => `At most ${max} minutes.`,
    minMinutes: (min) => `At least ${min} ${plural('en', min, { one: 'minute', other: 'minutes' })}.`,
    maxSeconds: (max) => `At most ${max} s.`,
    minCm: (min) => `At least ${min} cm.`,
    maxCm: (max) => `At most ${max} cm.`,
    maxChars: (max) => `At most ${max} characters.`,
    unknownCondition: 'Unknown limitation ID.',
    unknownConditionRef: 'ID not in the list.',
    symptomDirection: 'Choose how symptoms are changing.',
    irritability: 'Choose the irritability.',
    redFlag: 'Answer the red-flag question.',
    nothingToSave: 'No answers to save.',
    unknownMeasurement: 'Unknown measurement.',
    constraintIdInvalid: 'Invalid limitation ID.',
    exerciseIdInvalid: 'Invalid exercise ID.',
    constraintNotFound: 'Limitation not found.',
    exerciseNotFound: 'Exercise not found.',
    severity: 'Choose the severity.',
    onset: 'Onset must be YYYY, YYYY-MM or YYYY-MM-DD.',
    region: 'Choose the region.',
    side: 'Choose the side.',
    type: 'Choose the type.',
    diagnosisSource: 'Choose the source of the diagnosis.',
    basis: 'Choose the basis.',
    tooManyConditions: (max) => `At most ${max} limitations.`,
    report: {
      region: 'Choose where it is.',
      side: 'Choose which side.',
      type: 'Choose what it is.',
      severity: 'Choose how much it affects you.',
    },
  },
};

/** The part's record name (plural) and what becomes possible once it is on. */
const PART_WORDS: Record<HealthField, { record: string; entry: string }> = {
  conditions: { record: 'limitations', entry: 'you can enter limitations' },
  readiness: { record: 'readiness answers', entry: 'readiness questions are asked' },
  check_in: { record: 'pain records', entry: 'pain questions are asked' },
  measurements: { record: 'measurements', entry: 'you can enter measurements' },
  screening: { record: 'camera measurements and movement tests', entry: 'you can take camera measurements and enter movement tests' },
};

export default en;
