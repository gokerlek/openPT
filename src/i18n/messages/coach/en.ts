import { listText, plural, type Shape } from '../../define.ts';
import type tr from './tr.ts';

const en: Shape<typeof tr> = {
  goals: {
    general_fitness: 'Getting fitter',
    strength: 'Gaining strength',
    hypertrophy: 'Muscle growth',
    weight_management: 'Supporting weight management',
    mobility: 'Mobility',
  },
  pages: {
    overview: 'Overview',
    program: 'Program',
    measurements: 'Measurements',
    workout: 'Workout',
    progress: 'Progress',
    settings: 'Settings',
    library: 'Library',
    health: 'Health',
  },
  programCopy: {
    client: {
      title: "Let's build your program",
      goal: 'What do you want to do?',
      manual: "I'll choose myself",
      muscles: 'Select the muscles you want to train',
      unclear: "The goal wasn't clear. You can choose your goal and muscles below.",
    },
    pt: {
      title: 'Program draft for the client',
      goal: "What is the client's goal?",
      manual: "I'll set the conditions",
      muscles: 'Select the muscles to train',
      unclear: "The goal wasn't clear. You can choose the client's goal and the muscles to train below.",
    },
  },
  sensitive: {
    support:
      "The text mentions punishment, compensation or eating concerns; the AI won't turn that into a program goal. You can continue by choosing the conditions manually.",
    healthQuestion:
      "The text mentions pain, diagnosis or treatment; the AI won't derive a goal from it and won't suggest a diagnosis or treatment. You can continue by choosing the conditions manually.",
  },
  guard: {
    disabled: 'AI support is turned off for this client.',
    requestChanged: 'The request changed. Try again.',
    draftNotFound: 'Draft not found.',
  },
  engine: {
    support:
      "I'm not judging you here. Exercise isn't a punishment or a way to make up for what you ate. We can work out your conditions for today together and turn the changes you'd like to share with your trainer into a draft.",
    healthQuestion:
      "I can summarize the findings in your records, but I can't derive a diagnosis or treatment from them. If you have pain or a new symptom, tell your trainer; your trainer can refer you to a suitable health professional if needed. A camera angle alone doesn't show a disorder or a need for corrective exercise.",
    outOfScope:
      'I can help with your workout history, progress, recorded measurements and program drafts that fit your conditions. Which exercise or record would you like me to look at?',
    generalPlan: "A program draft is prepared for a specific client. Open the client's page and continue from there.",
    ambiguousClients: (names: readonly string[]) =>
      `More than one client has that name: ${listText('en', names)}. Write the full name to say which one you want me to look at.`,
    scopeNote: (shown: number) =>
      `This answer shows ${shown} record summaries. To look at the rest, ask with a specific client's name or open the client's page.`,
    scopeSource: 'Answer scope',
    introMeasurement:
      "I'm summarizing the recorded measurements below. I don't treat different methods and capture conditions as equivalent, and I don't derive a cause or diagnosis from a single angle.",
    introOverview:
      "Here's where things stand based on your records. I don't assume a reason the data doesn't show; the results aren't a score judging you.",
    noRecords:
      'There are no records for this question yet. You can pick the exercise you want to track with your trainer and record a starting value.',
    draft: {
      healthUnavailable: "The approved limitation records couldn't be read. I won't prepare a program draft without reading them.",
      mismatch:
        "Some of the requested exercises don't fit the equipment you selected or your recorded limitations. We can pick alternatives with your trainer.",
      notEnough:
        "Not enough assessable exercises were found under these conditions. Let's check the equipment selection, or the trainer can add a suitable alternative to the library.",
      rules: "The draft program didn't meet the program rules; the program was not changed.",
      phaseName: 'AI draft',
      rationale: (days: number, minutes: number) => [
        `Based on ${days} ${plural('en', days, { one: 'day', other: 'days' })} and your ${minutes}-minute time budget. Duration is a planning estimate.`,
        "Only library exercises that passed your selected equipment and limitation filter were used; exercises in your current program were prioritized.",
        "The starting draft has two working sets per exercise. The workout suggestion engine sets weights from your history; this draft doesn't make up weights.",
        'This new program replaces the current trainer program. The trainer publishes it after reviewing the frequency, recovery, sets and exercise selection.',
      ],
    },
  },
  chat: {
    forbidden: "You can't access this client's coach records.",
    invalidMessage: 'Check the message and the program conditions.',
    requestIdReused: 'This request ID was already used for a different message.',
    inProgress: 'A reply is being prepared. Try again in a moment.',
    publishing: 'The trainer is publishing a program. Try again when it finishes.',
    dailyLimit: "You've reached today's limit of 30 messages.",
    noConnection: 'No Gemini connection has been added. Set up the AI connection first.',
    needConditions:
      "For the draft, choose below which days, how many minutes and what equipment you can train with. I won't guess your conditions.",
    pendingLimit: 'We can prepare a new one after the trainer reviews the pending drafts.',
    planReply: (rationale: readonly string[]) =>
      `I've prepared a draft based on your conditions. It hasn't been applied to your program yet; your trainer can review the exercises, load and frequency and approve it.\n\n${rationale.join('\n')}`,
    closedDuring: 'AI support was turned off during the request. The reply was not saved.',
    permissionsChanged: "Data permissions changed. The reply wasn't saved; ask again with the current permissions.",
    onlyPt: 'Only the trainer can review the program draft.',
    invalidDecision: 'Invalid draft action.',
    replying: 'The coach reply is being prepared. Review the draft when it finishes.',
    publishStarted: 'The publishing that has started has to finish; the program may already be applied.',
    expired: 'The draft is more than three days old. Prepare it again from current records.',
    contextChanged: 'The program, permissions, measurements or library changed. Prepare a new draft from current records.',
    commit: 'AI coach record updated',
  },
  assistant: {
    selectionMessage: 'Choose full body or at least one muscle.',
    openClientPage: "Open a client's page to prepare a program.",
    healthUnavailable: "The permitted limitation records couldn't be read. No program is prepared without reading them.",
    noMobility: {
      pt: 'There are no suitable warm-up/cool-down exercises under these conditions. For mobility, add suitable warm-up/cool-down exercises to the library.',
      client:
        'There are no suitable warm-up/cool-down exercises under these conditions. For mobility, the trainer needs to add suitable exercises to the library.',
    },
    noMoves: {
      pt: 'There are no suitable library exercises for the selected muscles, equipment and limitations. Change the selection or add a suitable exercise to the library.',
      client:
        'There are no suitable library exercises for the muscles, equipment and limitations you selected. Change your selection or ask the trainer for an alternative.',
    },
    rulesUnmet: "The draft program didn't meet the program rules. The current program was not changed.",
    rationale: (goal: string, days: number, minutes: number) => [
      `Goal: ${goal}; ${days} ${plural('en', days, { one: 'day', other: 'days' })}, a planning budget of ${minutes} minutes per session. Actual time depends on rest and pace.`,
      'Exercises that fit your equipment and the permitted limitations; exercise history and varied movement patterns were taken into account.',
      "A two-set starting draft; loads come from the app's existing suggestion engine during the workout. You can edit the sets and compound blocks in the builder.",
    ],
    weightNote: "Exercise doesn't guarantee weight change; the program is not calorie compensation or an appearance score.",
    mobilityNote: 'This is a warm-up/cool-down draft from the library; it is not a diagnosis or corrective treatment program.',
    attention: {
      noHistory: 'There is no previous exercise history; set the starting load and technique together.',
      missingMuscles: (muscles: readonly string[]) => `Selected muscles the program doesn't cover: ${listText('en', muscles)}.`,
      consecutive: 'There are consecutive workout days; review the load on shared muscles and recovery.',
      limitedCoverage: 'Full-body coverage is limited in some programs; check the programs and exercises in the builder.',
    },
    draftName: (kind: 'workout' | 'program', date: string, suffix: string) => `AI · ${kind === 'workout' ? 'Workout' : 'Program'} ${date} ${suffix}`,
    forbidden: "You can't access these records.",
    permissionsChanged: 'Data permissions changed. Reopen.',
    invalidRequest: 'Check the goal, muscle, day, duration and equipment selections.',
    requestIdReused: 'This request ID was already used for a different action.',
    inProgress: 'A suggestion is being prepared. Try again when it finishes.',
    dailyLimit: "You've reached today's limit of 30 suggestions.",
    pickClient: 'Select a specific client for the goal.',
    needsConnection: 'A Gemini connection is needed to interpret the goal text. You can also make the selections by hand.',
    reviewFallback: {
      title: 'Record summary',
      noRecords: 'There are no comparable records yet.',
      next: "Log the next session with reps, load and effort; we'll compare progress on the same exercise and equipment.",
    },
    permissionsRevoked: 'Permissions changed. The result was not saved.',
    saveForbidden: 'AI permission or session is not valid.',
    draftPermissionsChanged: 'Permissions changed. Prepare a new draft.',
    ownProgramInvalid: 'Check the fields of your new own program.',
    programInvalid: "Check the program's days, exercises and sets.",
    saveStarted: 'Another save of this draft has started. Edit it from your own programs.',
    preparing: 'A suggestion is being prepared. Save when it finishes.',
    globalNoSave: "A program can't be saved from the general view.",
    draftStale: 'Records changed or the draft is more than three days old. Prepare a new draft.',
    exerciseMismatch: "An exercise doesn't match the current limitations or library. Choose an alternative.",
    savePermissionsChanged: 'Permissions changed. The program was not saved.',
    savedOwnRationale: (workouts: number) =>
      plural('en', workouts, {
        one: `Own program reviewed in the builder and saved: ${workouts} workout.`,
        other: `Own program reviewed in the builder and saved: ${workouts} workouts.`,
      }),
    deviceGone: 'The selected equipment is no longer in the library. Choose other equipment.',
    commit: 'AI suggestions updated',
  },
  notices: {
    aiProgram: (name: string, attention: string) => `AI-generated ${name}: ${attention}`,
  },
  review: {
    metrics: { strength: 'Estimated max', seconds: 'Duration', reps: 'Reps' },
    units: { kg: 'kg', seconds: 's', reps: 'reps' },
    performance: {
      strength: (kg: number, reps: number) => `${kg} kg × ${reps} ${plural('en', reps, { one: 'rep', other: 'reps' })}`,
      seconds: (seconds: number) => `${seconds} s`,
      reps: (reps: number) => `${reps} ${plural('en', reps, { one: 'rep', other: 'reps' })}`,
    },
    patternTitle: 'Workout routine',
    recent: (count: number) =>
      plural('en', count, {
        one: `There is ${count} completed workout record in the last 28 days.`,
        other: `There are ${count} completed workout records in the last 28 days.`,
      }),
    recentNext:
      "Continue the next session from the next workout in your current program; if the days and duration don't suit you, adjust the program to these conditions.",
    recentNextEmpty: "Log the next completed session; we'll start assessing frequency and progress from these records.",
    sessionSource: (date: string) => `${date} workout record`,
    baseline: (date: string, performance: string) => `${date}: ${performance} baseline record. There is no earlier comparison with the same equipment.`,
    baselineNext: 'Log the next session with the same exercise and equipment; compare reps and effort before deciding on a load increase.',
    exerciseSource: (date: string, title: string) => `${date} · ${title}`,
    change: (from: string, to: string, before: string, after: string, metric: string, direction: 'up' | 'down' | 'same', amount: string, unit: string) =>
      `${from} → ${to}: ${before} → ${after}. ${
        direction === 'same' ? `${metric} stayed the same` : `${metric} ${direction === 'up' ? 'increased' : 'decreased'} by ${amount} ${unit}`
      }; this compares these two sessions only.`,
    nextDown:
      'Hold off on increasing the load next session; log reps and effort on the same equipment. If the drop repeats, review set load and rest with the trainer.',
    nextUp: "Progress is there. Next session, check the current rep range and effort; follow the app's exercise suggestion.",
    nextSame:
      "Check the target rep range and effort log. If the target isn't met yet, progress reps at the same load; if it is, consider the app's next load suggestion.",
  },
  highlights: {
    celebrate: (dayName?: string) => (dayName ? `You logged your ${dayName} workout. Well done!` : "You logged today's workout. Well done!"),
    comment: (date: string, sets: number) =>
      plural('en', sets, {
        one: `On ${date}, ${sets} working set was logged. This is a summary of what you did; you don't have to do more.`,
        other: `On ${date}, ${sets} working sets were logged. This is a summary of what you did; you don't have to do more.`,
      }),
    suggest:
      "Enter how you feel in the readiness field before your next workout; the suggested load can be adjusted based on the records you've allowed. If an exercise or piece of equipment doesn't suit you, you can tell the coach so the trainer can review it.",
  },
  facts: {
    history: (count: number) =>
      plural('en', count, { one: `There is ${count} finished workout record.`, other: `There are ${count} finished workout records.` }),
    historySource: 'Workout history',
    defaultDayName: 'Workout',
    session: (date: string, day: string, sets: number, volume: number) =>
      `${date}: ${day}, ${sets} ${plural('en', sets, { one: 'working set', other: 'working sets' })}, ${volume} kg total volume. Volume isn't a strength score across different exercises.`,
    sessionSource: (date: string) => `${date} workout record`,
    difference: (kg: string) =>
      `The difference from the previous estimate for the same exercise and equipment is ${kg} kg. A single-session difference doesn't show a cause or a failure.`,
    noPrevious: 'No earlier estimate to compare with was found.',
    removedExercise: 'Exercise removed from the library',
    exercise: (date: string, title: string, e1rm: string, kg: number, reps: number, difference: string) =>
      `${date}, ${title}: estimated max ${e1rm} kg (${kg} kg × ${reps} ${plural('en', reps, { one: 'rep', other: 'reps' })}). ${difference} This is not a true max test.`,
    exerciseSource: (date: string, title: string) => `${date} · ${title} record`,
    program: (days: number) =>
      plural('en', days, {
        one: `The current trainer program has ${days} workout day defined.`,
        other: `The current trainer program has ${days} workout days defined.`,
      }),
    programSource: 'Trainer program',
    camera: (date: string, title: string, metrics: string) =>
      `${date}, ${title}: ${metrics}. This is a 2D camera measurement; no normal/abnormal label was given.`,
    measurement: (date: string, label: string, side: 'left' | 'right' | undefined, value: number, unit: string) =>
      `${date}, ${label}${side ? (side === 'left' ? ' (left)' : ' (right)') : ''}: ${value} ${unit}. I don't interpret the difference as progress without matching the measurement method.`,
    measurementSource: (date: string, title: string) => `Measurement ${date} · ${title}`,
    units: { kg: 'kg', cm: 'cm', s: 's', '%': '%', puan: 'points' },
  },
  general: {
    clientName: 'All clients',
    scope: (total: number, allowed: number) =>
      `AI support is turned on for ${allowed} of ${plural('en', total, { one: `${total} client`, other: `${total} clients` })}. Health records are used only within the scope of the current health consent. The personal records of the others aren't used in this assessment.`,
    scopeSource: 'Client scope',
    unreadable: (name: string) => `${name}: the record couldn't be read; I'm not drawing conclusions from missing information.`,
    unreadableSource: 'Missing record',
    capped: "At most 100 record summaries are shown in a general answer. To look at a specific client, ask from the client's page.",
    cappedSource: 'Answer scope',
  },
  keyErrors: {
    incomplete: "That value is too short. Copy the whole API key from Google AI Studio, not the key's name.",
    long: 'That value is too long for an API key. Paste only the key itself.',
    masked: 'That key is shortened or masked. Use the copy button in Google AI Studio to get the full key.',
    spaces: 'The key contains a space or line break. Use the copy button in Google AI Studio to get the full key.',
    characters: "That value isn't in API key format. Paste only the key; don't use an address, code or key name.",
    fallback: 'Check the Gemini API key.',
  },
  internal: {
    gemini: {
      noConnection: 'No Gemini connection. You can make the selections by hand.',
      interpretFailed: (status: number) => `Gemini couldn't interpret the goal (${status}). You can make the selections by hand.`,
      noResponse: (status: number) => `The Gemini connection didn't respond (${status}). Check the key and model access.`,
      inventedExercise: "The AI returned an exercise that isn't in the library. The program was not changed.",
    },
    keys: {
      invalidSecret: 'Invalid session key.',
      unreadable: "The key record couldn't be read.",
      clientRepo: "The client's data repository must be private and not a fork.",
      appRepo: "The private data space isn't ready. Save the setup view first.",
    },
    general: {
      privateRepo: 'A private, non-fork data repository is required for the trainer chat.',
      invalidFile: 'Invalid coach file.',
      readOnly: "The general chat can't write to session or program files.",
      noConnection: "The trainer's Gemini connection is turned off.",
      noPublish: "A program can't be published from the general chat.",
    },
    commits: {
      clientKey: "Client's AI connection updated",
      preferences: "Client's coach notification preferences updated",
      ptKey: 'Gemini connection setting updated',
    },
  },
  failures: {
    programUnreadable: "The current program couldn't be read. Fix the program before preparing a draft.",
    connectionClosed: 'The Gemini connection has been turned off. Check your key.',
    aiDisabled: 'AI support was turned off. The program was not published.',
    recordsChanged: 'Records or permissions changed. Prepare the draft again.',
    catalogChanged: 'The program or the library changed. Prepare the draft again; the current program is unchanged.',
  },
  api: {
    clientSessionRequired: 'A client session is required.',
    ptOnly: 'Only the trainer can do this.',
    generalOpenFailed: "Couldn't open the general coach chat.",
    generalReplyFailed: "Couldn't prepare the reply. Check the Gemini connection.",
    openFailed: "The AI coach can't be opened right now.",
    replyFailed: "Couldn't prepare the AI reply. Check the Gemini connection or try again.",
    draftApplyFailed: "Couldn't apply the draft.",
    invalidDraft: 'The draft ID or the program details are invalid.',
    keyStatusUnreadable: "The key status couldn't be read. Check your access to the private data space.",
    checkKey: 'Check the key.',
    invalidKeyRequest: 'Invalid key request.',
    keySaveFailed: "Couldn't save the key. Check your access to the private data space and try again.",
    connectionOpenFailed: "Couldn't open the AI connection.",
    clientNotFound: 'Client not found.',
    ptMustEnable: 'The trainer must turn on AI support first.',
    connectionSaveFailed: "Couldn't save the AI connection.",
    highlightsFailed: "The coach comments can't be read right now.",
    preferencesReadFailed: "Couldn't read the coach preferences.",
    checkPreferences: 'Check the preferences.',
    preferencesSaveFailed: "Couldn't save the coach preferences.",
    programSaveFailed: "Couldn't save the program. Try again.",
  },
  panel: {
    loading: 'Opening AI suggestions',
    loadFailed: "Couldn't open the suggestions",
    retry: 'Try again',
    actionFailed: "Couldn't complete the action. Try again.",
    interpreted: "What you wrote was turned into selections. Fields you didn't mention were left empty; check them and fill in what's missing.",
    disabledTitle: 'AI support is off',
    openClientSettings: 'Open client settings',
    askTrainer: 'Your trainer can turn on AI support.',
    reviewTab: 'Progress',
    programTab: 'Build a program',
    reviewTitle: 'Progress review',
    reviewEmpty: 'Key changes and the next step.',
    preparing: 'Preparing…',
    reevaluate: 'Review again',
    evaluate: 'Review',
    nextStep: 'Next step: ',
    legacyReview: 'This older review is only a record summary. Review again for progress and next steps.',
    reviewPrompt: 'Press Review to compare your records.',
    sources: 'Source records',
    programHint: 'Set the goal and conditions; edit the draft in the builder.',
    goalPlaceholder: 'Full body, 2 days a week, 45 minutes, dumbbells.',
    interpret: 'Interpret goal',
    conditionsTitle: 'Workout conditions',
    goalLabel: 'Goal',
    pickGoal: 'Select a goal',
    fullBody: 'Full body',
    weekdays: 'Workout days',
    minutes: 'Session length (minutes)',
    minutesPlaceholder: '15–120',
    equipment: 'Equipment',
    createProgram: 'Create program',
    createWorkout: 'Create a single workout',
    addConnection: 'Add a Gemini connection',
    dayCount: (days: number) => `${days} ${plural('en', days, { one: 'day', other: 'days' })}`,
    saved: 'Assigned / saved',
    draft: 'Draft',
    attention: 'To review',
    rationale: 'Why these exercises',
    editInBuilder: 'Edit in the builder',
    approve: 'Approve and assign to client',
    replacesProgram: 'Once approved, it replaces the current trainer program.',
    openProgram: 'Open program',
    editAndSave: 'Edit in the builder and save',
  },
  launcher: {
    title: 'AI coach',
    scopeClient: 'Only your own records · ',
    scopeSelected: "This client's records · ",
    scopeAll: 'All clients · ',
    evaluateAll: 'Review all clients',
    backToClient: "Back to this client's suggestions",
    preferencesLink: 'Celebration and suggestion preferences',
    nudgeTitle: 'Message from your coach',
    nudgeClose: 'Close coach message',
    nudgeOpen: 'Open suggestions',
  },
  connection: {
    summary: (connected: boolean) => `My own Gemini connection ${connected ? '· connected' : '· optional'}`,
    intro:
      "If you add your own key, it's used to interpret the goal you write. The trainer uses their own connection. Your key is stored encrypted and is never shown again.",
    disabled: 'Your trainer needs to turn on AI support before you can add a new connection. You can remove your existing connection.',
    getKey: 'Get a key from Google AI Studio',
    keyLabel: 'Gemini API key',
    changePlaceholder: 'A new key to replace the connection',
    newPlaceholder: 'Paste your key',
    save: 'Save my connection',
    remove: 'Remove my connection',
  },
  preferences: {
    title: 'AI coach preferences',
    // i18n-followup(T3): the text names the “AI review” (Progress) and “Suggest a program with AI” (Programs) buttons; T3 must translate those button labels with exactly these English names.
    description:
      'If your trainer has turned on AI support, you can reach the AI coach from the “AI review” button under Progress and the “Suggest a program with AI” button under Programs. Automatic messages are then shown according to your preferences. Health records are limited to the scope of your current health consent; no Gemini call is made for these messages.',
    loading: 'Opening preferences…',
    reload: 'Reopen preferences',
    saveFailed: "Couldn't save the preference.",
    comments: { label: 'Workout comments', hint: 'Show a short summary of the workout I logged.' },
    celebrations: { label: 'Celebrations and congratulations', hint: 'Show a motivating message when I finish a workout.' },
    suggestions: { label: 'Coach suggestions', hint: 'Show next-step suggestions based on my records.' },
  },
  settings: {
    title: 'AI',
    description: 'Add or change the Gemini key after setup.',
    heading: 'Gemini connection',
    unreadable: "The key status couldn't be read. Check your access to the private data space or save the key again.",
    fromEnvironment: 'The key was set on Vercel during setup.',
    fromSettings: 'The key was saved from this dashboard.',
    none: 'No Gemini key has been added yet.',
    create: 'Create a Gemini key in Google AI Studio',
    newKeyLabel: 'New Gemini API key',
    keyLabel: 'Gemini API key',
    keyHint:
      "A saved key is never shown again. Copy the whole key with the copy button in Google AI Studio; don't paste the key's name or a masked preview. If you leave this empty, the current key stays unchanged.",
    saving: 'Saving…',
    change: 'Change key',
    save: 'Save key',
    remove: 'Remove the dashboard key',
    note: "The key you add here is stored encrypted in your own private data space and is used instead of the key on Vercel. If you remove it, the key on Vercel (if any) is used again; the key at Google is not revoked.",
    removed: 'The dashboard key was removed.',
    saved: "The Gemini key was saved. You don't need to redeploy.",
    saveFailed: "Couldn't save the key.",
  },
  draftPages: {
    pt: {
      title: 'Edit AI program',
      description: 'Edit the programs, exercises and compound blocks; assign it to the client when it is ready.',
      back: 'Program',
      notice:
        "When you approve, it replaces the client's current trainer program. Changes you make on this screen don't affect the client until you approve.",
    },
    client: {
      title: 'Edit AI draft',
      back: 'Program',
      notice:
        "Check the programs, their days, the exercises and the sets. When you save, it becomes your own program and is visible to your trainer, who can edit it if needed. Your current trainer program doesn't change. If your goal or records changed, prepare a new draft.",
    },
  },
};

export default en;
