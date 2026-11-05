/**
 * Hazır egzersiz kütüphanesinin İngilizce metinleri (US İngilizcesi), `exercise-library.ts` ile aynı kimliklerle.
 *
 * Yalnız çevrilebilen alanlar burada durur: başlık, açıklama, ipuçları. Kimlik, kas, ekipman gibi kodlar
 * Türkçe kaynakta kalır. Her hareketin ipucu sayısı ve sırası Türkçe kaynakla aynıdır (`library-en.test.ts` denetler).
 * PT'nin kendi ya da ezdiği egzersizler bu tabloya girmez; onlar PT'nin yazdığı metindir.
 */
export type ExerciseTextEn = { title: string; description?: string; cues?: readonly string[] };

export const EXERCISE_LIBRARY_EN: Readonly<Record<string, ExerciseTextEn>> = {
  'halter-bench-press': {
    title: 'Barbell Bench Press',
    description: 'Flat-bench barbell chest press; the foundational upper-body pushing movement.',
    cues: [
      'Pinch your shoulder blades together and set them into the bench',
      'Feet planted, natural arch kept in the lower back',
      'Lower the bar to your lower chest under control, elbows about 45° from your torso',
    ],
  },
  'egimli-dambil-press': {
    title: 'Incline Dumbbell Press',
    description: 'Upper-chest press with dumbbells on a 30-45° incline bench.',
    cues: [
      'Set the bench angle between 30-45°',
      'Lower the dumbbells to chest level under control',
      "Don't clank the dumbbells together at the top; keep the tension",
    ],
  },
  'duz-sehpada-dambil-fly': {
    title: 'Flat Dumbbell Fly',
    description: 'Fly movement that isolates the chest muscles.',
    cues: [
      'Keep your elbows slightly bent and fixed',
      "Don't lower below shoulder level",
      'Finish each rep by squeezing your chest',
    ],
  },
  'sinav': {
    title: 'Push-Up',
    description: 'Bodyweight chest, shoulder and triceps work.',
    cues: [
      'Head, hips and heels in one line',
      'Hands shoulder-width apart, elbows about 45°',
      'Push up hard as your chest nears the floor',
    ],
  },
  'paralel-bar-dips': {
    title: 'Parallel Bar Dips',
    description: 'Bodyweight triceps and lower-chest work on parallel bars.',
    cues: [
      'Keep your shoulders away from your ears',
      'Lower until your elbows reach about 90°',
      'Leaning your torso slightly forward works the chest more',
    ],
  },
  'ayakta-halter-omuz-press': {
    title: 'Standing Barbell Overhead Press',
    description: 'Standing barbell press overhead.',
    cues: [
      "Brace your abs and glutes; don't arch your lower back",
      'Press the bar up a vertical line close to your chin',
      'At the top, move your head forward under the bar',
    ],
  },
  'oturarak-dambil-omuz-press': {
    title: 'Seated Dumbbell Shoulder Press',
    description: 'Back-supported dumbbell shoulder press.',
    cues: [
      'Press your back into the bench',
      'Lower the dumbbells to ear level',
      'Press up without locking your elbows',
    ],
  },
  'dambil-yana-acis': {
    title: 'Dumbbell Lateral Raise',
    description: 'Side delt isolation.',
    cues: [
      'Lean slightly forward, elbows slightly bent',
      'Raise up to shoulder height',
      'Control the lowering over 2-3 seconds',
    ],
  },
  'kablo-face-pull': {
    title: 'Cable Face Pull',
    description: 'Rear delts and upper back; good for shoulder health.',
    cues: [
      'Pull the rope toward face level',
      'Elbows at shoulder height and flared out',
      'Squeeze your shoulder blades together at the end',
    ],
  },
  'barfiks': {
    title: 'Pull-Up',
    description: 'Bodyweight vertical pull.',
    cues: [
      'Start from a full dead hang',
      'Pull your chest toward the bar so your chin clears it',
      'Lower under control without swinging',
    ],
  },
  'lat-pulldown': {
    title: 'Lat Pulldown',
    description: 'Machine vertical pull; an alternative to the pull-up.',
    cues: [
      'Chest up, lean back slightly',
      'Pull the bar to your upper chest',
      'Drive your elbows down and back',
    ],
  },
  'oturarak-kablo-row': {
    title: 'Seated Cable Row',
    description: 'Horizontal pull; mid back.',
    cues: [
      "Keep your back upright; don't swing your torso",
      'Pull the handle to your abdomen',
      'Squeeze your shoulder blades together at the end',
    ],
  },
  'halter-bent-over-row': {
    title: 'Barbell Bent-Over Row',
    description: 'Horizontal pull with a barbell, bent over.',
    cues: [
      'Hinge at the hips, back neutral',
      'Pull the bar to your navel',
      'Hold your torso angle through the end of the set',
    ],
  },
  'tek-kol-dambil-row': {
    title: 'Single-Arm Dumbbell Row',
    description: 'Bench-supported one-arm row.',
    cues: [
      'Place your supporting hand and knee on the bench',
      'Pull the dumbbell toward your hip',
      "Don't rotate your torso",
    ],
  },
  'deadlift': {
    title: 'Deadlift',
    description: 'Lifting a barbell from the floor; the foundational posterior-chain movement.',
    cues: [
      'Bar over mid-foot, close to your shins',
      'Back neutral; hips and chest rise together',
      "At lockout, squeeze your glutes; don't lean back",
    ],
  },
  'romanian-deadlift': {
    title: 'Romanian Deadlift',
    description: 'Hamstring-focused pull using a hip hinge with slightly bent knees.',
    cues: [
      'Knees slightly bent and fixed',
      'Lower the bar close to your legs, pushing your hips back',
      'Reverse direction once your hamstrings are stretched',
    ],
  },
  'halter-back-squat': {
    title: 'Barbell Back Squat',
    description: 'Squat with a barbell on your back; the foundational lower-body movement.',
    cues: [
      'Bar on your upper back, abs tight',
      'Knees track in the same direction as your toes',
      'Hips go down at least to knee level, heels stay down',
    ],
  },
  'goblet-squat': {
    title: 'Goblet Squat',
    description: 'Squat holding a dumbbell at your chest; ideal for learning technique.',
    cues: [
      'Hold the dumbbell close to your chest',
      'Your elbows should pass inside your knees',
      'Torso upright, heels down',
    ],
  },
  'leg-press': {
    title: 'Leg Press',
    description: 'Machine press; quads and glutes.',
    cues: [
      "Don't let your lower back and hips lift off the pad",
      "Don't let your knees cave in",
      "Don't lock your knees at the top",
    ],
  },
  'bulgarian-split-squat': {
    title: 'Bulgarian Split Squat',
    description: 'Single-leg squat with the rear foot on a bench.',
    cues: [
      'Front foot far enough from the bench',
      'Torso leaning slightly forward',
      'Front knee in line with your toes',
    ],
  },
  'dambil-lunge': {
    title: 'Dumbbell Lunge',
    description: 'Stepping lunge; legs and balance.',
    cues: [
      'Take a long step, torso upright',
      'Back knee approaches the floor',
      'Drive up through your front heel',
    ],
  },
  'halter-hip-thrust': {
    title: 'Barbell Hip Thrust',
    description: 'Hip thrust with your back on a bench; glutes.',
    cues: [
      'Upper back on the edge of the bench',
      'Chin near your chest, ribs down',
      'Squeeze your glutes for 1 sec at the top',
    ],
  },
  'leg-extension': {
    title: 'Leg Extension',
    description: 'Quad isolation.',
    cues: [
      "Knee joint aligned with the machine's axis",
      'Squeeze for 1 sec at the top',
      'Lower under control without dropping the weight',
    ],
  },
  'yuzustu-leg-curl': {
    title: 'Lying Leg Curl',
    description: 'Hamstring isolation.',
    cues: [
      "Don't let your hips lift off the pad",
      'Curl your heels toward your glutes',
      'Slow down the lowering',
    ],
  },
  'ayakta-calf-raise': {
    title: 'Standing Calf Raise',
    description: 'Calf muscles.',
    cues: [
      'Stretch fully at the bottom',
      'Pause 1 sec on your toes',
      "Don't lock your knees",
    ],
  },
  'halter-biceps-curl': {
    title: 'Barbell Biceps Curl',
    description: 'Standing biceps curl with a straight bar.',
    cues: [
      'Keep your elbows fixed at your sides',
      'Curl without swinging your torso',
      'Fully extend your arms on the way down',
    ],
  },
  'egimli-sehpada-dambil-curl': {
    title: 'Incline Dumbbell Curl',
    description: 'Biceps work in a lengthened position.',
    cues: [
      'Bench at about 45°, back supported',
      "Don't roll your shoulders forward",
      'Curl with your palms facing up',
    ],
  },
  'hammer-curl': {
    title: 'Hammer Curl',
    description: 'Biceps and forearms with a neutral grip.',
    cues: [
      'Palms face each other',
      'Elbows stay fixed',
      'Lower under control',
    ],
  },
  'triceps-halat-pushdown': {
    title: 'Triceps Rope Pushdown',
    description: 'Triceps isolation on a cable with a rope.',
    cues: [
      'Elbows close to your torso and fixed',
      'Spread the rope apart at the bottom',
      "Don't let your elbows drift forward on the way up",
    ],
  },
  'oturarak-dambil-triceps-extension': {
    title: 'Seated Dumbbell Triceps Extension',
    description: 'Overhead triceps extension with a dumbbell.',
    cues: [
      'Elbows point at the ceiling',
      'Lower the dumbbell behind your head under control',
      "Don't arch your lower back",
    ],
  },
  'plank': {
    title: 'Plank',
    description: 'Isometric abdominal and trunk stability work.',
    cues: [
      'Elbows under your shoulders',
      "Don't let your hips sag or rise",
      "Don't hold your breath; brace your abs",
    ],
  },
  'yan-plank': {
    title: 'Side Plank',
    description: 'Oblique and trunk stability work.',
    cues: [
      'Elbow under your shoulder',
      'Hips up, body in a straight line',
      'Equal time on both sides',
    ],
  },
  'dead-bug': {
    title: 'Dead Bug',
    description: 'Controlled abdominal exercise for lower-back stability.',
    cues: [
      'Keep your lower back pressed into the floor',
      'Extend the opposite arm and leg together',
      'Slow, controlled breathing',
    ],
  },
  'asili-bacak-kaldirma': {
    title: 'Hanging Leg Raise',
    description: 'Abdominal exercise hanging from a bar.',
    cues: [
      'Prevent swinging',
      'Curl your pelvis upward',
      'Lower under control',
    ],
  },
  'kettlebell-swing': {
    title: 'Kettlebell Swing',
    description: 'Explosive swing driven by a hip hinge.',
    cues: [
      'Power comes from your hips, not your arms',
      'Back neutral, push your hips back',
      'Squeeze your glutes at the top, kettlebell at chest height',
    ],
  },
  'ciftci-yuruyusu': {
    title: "Farmer's Walk",
    description: 'Walking with heavy dumbbells; grip and trunk.',
    cues: [
      'Shoulders back, torso upright',
      'Short, controlled steps',
      'Grip the dumbbells firmly',
    ],
  },
  'kurek-ergometresi': {
    title: 'Rowing Machine',
    description: 'Low-pace rowing for warm-up.',
    cues: [
      'Sequence: legs → torso → arms',
      'Reverse the sequence on the return',
      'Keep your back neutral',
    ],
  },
  'sabit-bisiklet': {
    title: 'Stationary Bike',
    description: 'Easy-pace pedaling for warm-up.',
    cues: [
      'Seat at hip height',
      'At a pace where you can talk',
      '5-8 minutes is enough',
    ],
  },
  'band-pull-apart': {
    title: 'Band Pull-Apart',
    description: 'Shoulder and upper-back activation.',
    cues: [
      'Arms at shoulder height and straight',
      'Pull the band apart toward your chest',
      'Squeeze your shoulder blades together',
    ],
  },
  'kedi-deve-mobilite': {
    title: 'Cat-Camel Mobility',
    description: 'Spinal mobility for the cooldown.',
    cues: [
      'Start on all fours',
      'Round your back as you exhale',
      'Open your chest as you inhale',
    ],
  },
  'cocuk-pozu': {
    title: "Child's Pose",
    description: 'Back and hip relaxation for the cooldown.',
    cues: [
      'Knees apart, hips back toward your heels',
      'Reach your arms forward',
      'Breathe deep and slow',
    ],
  },
  'kapi-araliginda-gogus-esnetme': {
    title: 'Doorway Chest Stretch',
    description: 'Chest and front-shoulder stretch for the cooldown.',
    cues: [
      'Rest your forearm against the door frame',
      'Lean your torso slowly forward',
      "Don't hike your shoulder toward your ear",
    ],
  },
  'makine-chest-press': {
    title: 'Machine Chest Press',
    description: 'Seated machine chest press; safer than the barbell and suited to beginners.',
    cues: [
      'Press your back into the pad, pinch your shoulder blades together',
      'Handles at mid-chest height',
      'Press without fully locking your elbows',
    ],
  },
  'pec-deck': {
    title: 'Pec Deck (Butterfly)',
    description: 'Machine chest fly; isolates the chest.',
    cues: [
      'Keep your elbows slightly bent and fixed',
      'Bring your arms together in front of your chest and squeeze briefly',
      "Don't force a stretch in the front of your shoulder as you open",
    ],
  },
  'kablo-crossover': {
    title: 'Cable Crossover',
    description: 'Chest fly between two cables; constant tension throughout the movement.',
    cues: [
      'Step forward, torso leaning slightly forward',
      'Bring your hands together in front of your navel',
      'Keep the elbow angle the same throughout the movement',
    ],
  },
  'smith-bench-press': {
    title: 'Smith Machine Bench Press',
    description: 'Bench press on a Smith machine; the bar is on rails, so no balancing is needed.',
    cues: [
      'Lower the bar to mid-chest',
      'Shoulder blades fixed on the bench',
      'Set your grip before you unhook the bar',
    ],
  },
  'makine-omuz-press': {
    title: 'Machine Shoulder Press',
    description: 'Seated machine shoulder press.',
    cues: [
      'Back against the pad, natural arch in the lower back',
      'Press the handles up from ear level',
      'On the way down, lower your elbows to just below your shoulders',
    ],
  },
  'makine-yana-acis': {
    title: 'Machine Lateral Raise',
    description: 'Side delt isolation on a machine.',
    cues: [
      "Don't shrug your shoulders toward your ears",
      'Raise your arms to shoulder height',
      'Control the lowering slowly',
    ],
  },
  'kablo-yana-acis': {
    title: 'Cable Lateral Raise',
    description: 'One-arm lateral raise on a cable; there is tension at the bottom as well.',
    cues: [
      'Let the cable pass in front of your body',
      "Elbow slightly bent; your hand shouldn't rise above your elbow",
      'Raise without swinging your torso',
    ],
  },
  'ters-pec-deck': {
    title: 'Reverse Pec Deck',
    description: 'Rear-delt fly sitting backward on the pec deck machine.',
    cues: [
      'Rest your chest against the pad',
      'Squeeze your shoulder blades as you open your arms out to the sides',
      "Don't shrug your shoulders toward your ears",
    ],
  },
  't-bar-row': {
    title: 'T-Bar Row',
    description: 'Bent-over row on a plate-loaded T-bar.',
    cues: [
      'Hinge at the hips, back neutral',
      'Pull the handle to your lower chest',
      'Keep your elbows close to your torso',
    ],
  },
  'kablo-duz-kol-pulldown': {
    title: 'Cable Straight-Arm Pulldown',
    description: 'Pulling down on a cable with straight arms; isolates the lats.',
    cues: [
      'Torso leaning slightly forward, arms almost straight',
      'Sweep the bar toward your hips',
      'Feel the stretch in your lats at the top',
    ],
  },
  'hiperekstansiyon': {
    title: 'Back Extension',
    description: 'Raising your torso on a hyperextension bench, working the lower back and glutes.',
    cues: [
      'Hip bone just above the edge of the pad',
      "Back neutral; don't bend excessively at the lower back",
      'Squeeze your glutes at the top, torso in line with your legs',
    ],
  },
  'makine-preacher-curl': {
    title: 'Machine Preacher Curl',
    description: 'Biceps curl on a preacher machine; prevents cheating.',
    cues: [
      'Back of your upper arm fully on the pad',
      "Don't fully extend your arm at the bottom; keep the tension",
      'Squeeze your biceps at the top',
    ],
  },
  'kablo-biceps-curl': {
    title: 'Cable Biceps Curl',
    description: 'Biceps curl on the low pulley with a bar or rope.',
    cues: [
      'Elbows fixed at your sides',
      "Don't swing your torso",
      'Fully extend your arms on the way down',
    ],
  },
  'makine-triceps-extension': {
    title: 'Machine Triceps Extension',
    description: 'Seated machine triceps press.',
    cues: [
      'Elbows fixed on the pad',
      'Fully extend your arms and squeeze briefly',
      "Don't let your shoulders roll forward on the return",
    ],
  },
  'kablo-bas-ustu-triceps': {
    title: 'Cable Overhead Triceps Extension',
    description: 'Overhead triceps press with a rope, facing away from the stack; stretches the long head.',
    cues: [
      'Elbows next to your head, pointing forward',
      'Extend from the elbow only',
      "Keep your torso still and don't let your lower back arch",
    ],
  },
  'hack-squat': {
    title: 'Hack Squat',
    description: 'Back-supported squat on a hack squat machine.',
    cues: [
      'Back and hips against the pad',
      'Knees track in line with your toes',
      'Hips go down below knee level',
    ],
  },
  'smith-squat': {
    title: 'Smith Machine Squat',
    description: 'Squat on a Smith machine; because the bar is on rails, your feet can sit slightly forward.',
    cues: [
      'Feet slightly in front of the bar',
      'Chest up, eyes forward',
      'Hips go down to knee level',
    ],
  },
  'oturarak-leg-curl': {
    title: 'Seated Leg Curl',
    description: 'Seated machine hamstring curl.',
    cues: [
      "Knee axis aligned with the machine's axis",
      'The thigh pad should hold your legs snugly',
      'Curl your heels toward your glutes, release slowly',
    ],
  },
  'makine-kalca-acma': {
    title: 'Machine Hip Abduction (Abductor)',
    description: 'Seated machine hip abduction, pushing your legs outward; works the outer hips.',
    cues: [
      'Back against the pad, hips fixed',
      'Push your knees out and hold briefly',
      "Don't drop the weight as your legs close",
    ],
  },
  'makine-kalca-kapama': {
    title: 'Machine Hip Adduction (Adductor)',
    description: 'Seated machine hip adduction, bringing your legs together; works the inner thighs.',
    cues: [
      'Choose a starting width without forcing it',
      'Bring your knees together under control',
      'Release the weight slowly as you open',
    ],
  },
  'makine-hip-thrust': {
    title: 'Machine Hip Thrust',
    description: 'Hip thrust on a hip thrust machine; no need to set up a bar.',
    cues: [
      'Upper back against the pad',
      'Drive through your heels, squeeze your glutes at the top',
      'Lift with your glutes, not your lower back',
    ],
  },
  'makine-glute-kickback': {
    title: 'Machine Glute Kickback',
    description: 'Single-leg kickback on a machine; isolates the glutes.',
    cues: [
      "Torso steady, don't let your lower back sag",
      'Push your leg back from the hip',
      'Squeeze your glutes briefly at the top',
    ],
  },
  'makine-crunch': {
    title: 'Machine Crunch',
    description: 'Seated machine ab crunch.',
    cues: [
      "Start the movement from your abs; don't pull with your arms",
      'Squeeze briefly at the bottom',
      "Don't drop the weight on the way back up",
    ],
  },
  'makine-govde-dondurme': {
    title: 'Machine Torso Rotation',
    description: 'Seated machine torso rotation in both directions; works the obliques.',
    cues: [
      'Hips and knees fixed',
      'Start the rotation from your abs',
      'Do equal reps to both sides',
    ],
  },
  'kablo-woodchop': {
    title: 'Cable Woodchop',
    description: 'Diagonal pull on the functional trainer; rotational torso power.',
    cues: [
      'Rotate through your hips and torso; your arms just carry',
      'Rear foot pivots on the ball',
      'Do equal reps to both sides',
    ],
  },
  'kosu-bandi': {
    title: 'Treadmill',
    description: 'Walking or running on a treadmill; warm-up and endurance.',
    cues: [
      'Increase the speed gradually',
      'Walk upright without holding on',
      'You can make it harder with incline',
    ],
  },
  'eliptik': {
    title: 'Elliptical',
    description: 'Low-impact cardio; warm-up and endurance.',
    cues: [
      "Don't let your heels lift off the pedals",
      'Use your arms too',
      'Increase the resistance gradually',
    ],
  },
  'merdiven': {
    title: 'Stepmill (Stair Climber)',
    description: 'Climbing a continuously rotating staircase; cardio that emphasizes the hips and legs.',
    cues: [
      "Don't lean on the handrails; stand tall",
      'Press through the whole step',
      'Keep the pace at a level where you can talk',
    ],
  },
  'air-bike-sprint': {
    title: 'Air Bike Sprint',
    description: 'Short, high-intensity intervals on an air bike; whole-body conditioning.',
    cues: [
      'Push and pull with your arms and legs together throughout the interval',
      'Pedal slowly during rest',
      'Hold your pace to the end of the interval',
    ],
  },
  'ters-tutus-lat-pulldown': {
    title: 'Reverse-Grip Lat Pulldown',
    description: 'Pulldown on the lat pulldown machine with a narrow, palms-facing (supinated) grip; increases biceps involvement.',
    cues: [
      'Hands narrower than shoulder width, palms facing you',
      'Pull the bar to your upper chest, elbows close to your torso',
      'Feel the stretch in your lats at the top',
    ],
  },
  'destekli-sandalye-squat': {
    title: 'Assisted Chair Squat',
    description: 'Squat to a limited depth while holding on for support; the safest entry step for the squat pattern.',
    cues: [
      "Lower by sending your hips back; don't push your knees forward",
      "Don't hang on the support; steady yourself with just your fingertips",
      "Don't collapse onto the chair; touch it under control and stand up",
    ],
  },
  'goblet-box-squat': {
    title: 'Goblet Box Squat',
    description: 'Squat touching a box with the weight held at your chest; knee angle and depth are fixed.',
    cues: [
      "Don't plop down on the box; touch it lightly with your hips and stand up",
      'Keep the weight tight to your chest, elbows pointing down',
      'Knees stay in line with your second toe',
    ],
  },
  'spanish-squat': {
    title: 'Spanish Squat (Banded)',
    description: 'A band running behind the knees counters anterior shift; isometric loading for patellar tendinopathy.',
    cues: [
      'Run the band behind your knees, sit your hips back and lean into the band',
      "Keep your torso upright; don't lean forward",
      'Stop at an angle where pain stays at or below 3/10 and hold there',
    ],
  },
  'glute-bridge': {
    title: 'Glute Bridge',
    description: 'Supine hip thrust; glute activation without loading the spine.',
    cues: [
      'Pull your ribs down; lift with your hips, not your lower back',
      'Squeeze your glutes for 2 seconds at the top, then lower slowly',
      'Press through your heels and lift your toes slightly',
    ],
  },
  'notr-tutus-floor-press': {
    title: 'Neutral-Grip Dumbbell Floor Press',
    description: 'Chest press on the floor with a neutral grip; your elbows do not go below torso level.',
    cues: [
      'Elbows at 45 degrees to your torso; pause for 1 second when they touch the floor',
      "Tuck your shoulder blades into your back pockets; don't let your shoulders roll forward",
      'Wrist straight, dumbbell in line with your palm',
    ],
  },
  'landmine-press': {
    title: 'Landmine Press',
    description: 'One end of the bar is anchored to the floor; the press follows the scapular plane and finishes before going fully overhead.',
    cues: [
      'Bar travels on a diagonal: from shoulder height up and forward',
      "Keep your ribs down; don't lean back",
      'At the top, reach up toward your ear and let your shoulder blade rotate freely',
    ],
  },
  'dar-tutus-upright-row': {
    title: 'Upright Row (Close Grip)',
    description: 'Vertical pull with a close grip. Because the shoulder is raised in internal rotation, the impingement risk is high; it is kept in the library as an example of a risky movement.',
    cues: [
      'Do a scapular-plane thumbs-up lateral raise instead',
      "If you must, use a wide grip and don't let your elbows rise above shoulder height",
      'If you feel a pinch or catch in the shoulder, stop the movement',
    ],
  },
  'gogus-destekli-row': {
    title: 'Chest-Supported Row',
    description: 'Row with your torso resting on a pad; works the back without carrying a static load on the lower back.',
    cues: [
      'First slide your shoulder blades back and down, then pull the elbow',
      "Elbows at 45 degrees to your torso; don't let your shoulders rise toward your ears",
      "Neck neutral; don't push your head toward the pad",
    ],
  },
  'ense-arkasi-lat-pulldown': {
    title: 'Behind-the-Neck Lat Pulldown',
    description: 'Pulldown with the bar lowered behind the neck. It puts the shoulder in the apprehension position and strains the neck; it is kept in the library as an example of a risky movement.',
    cues: [
      "Don't use this variation; pull the bar to the front, to your collarbone",
      "If you have to crane your neck forward to clear the bar, this movement isn't right for you",
      'Stop immediately if you feel a catch in the shoulder',
    ],
  },
  'mcgill-curl-up': {
    title: 'McGill Curl-Up',
    description: 'Abdominal isometric with your hands under your lower back, preserving the lumbar lordosis; no repeated lumbar flexion.',
    cues: [
      "Put your hands under your lower back; don't flatten your back into the floor",
      "Lift your head and shoulders 2–3 cm; don't tuck your chin into your chest",
      'Work with 7–8 second holds; add reps, not time',
    ],
  },
  'bird-dog': {
    title: 'Bird Dog',
    description: 'Extending the opposite arm and leg from a quadruped position; works the extensor chain with a neutral spine.',
    cues: [
      "Imagine a glass of water on your lower back and don't spill it",
      "Don't raise your arm and leg above shoulder-hip level",
      'On the return, finish by touching elbow to knee',
    ],
  },
  'pallof-press': {
    title: 'Pallof Press',
    description: "Holding your torso still against the cable's rotational pull; works the obliques without loaded rotation.",
    cues: [
      "Your torso shouldn't rotate at all as you extend your arms",
      "Lock your ribs down; don't lean back",
      "Don't hold your breath; exhale on the press, inhale on the return",
    ],
  },
  'tek-el-tasima': {
    title: 'Suitcase Carry',
    description: 'Walking with a weight in one hand; resists leaning to the side.',
    cues: [
      "Keep your shoulders level; don't lean toward the load",
      'Keep your ribs down, steps short and quiet',
      "End the set when your grip starts to open; don't drop the weight",
    ],
  },
  'agirlikli-russian-twist': {
    title: 'Weighted Russian Twist',
    description: 'Leaning back and rotating side to side with a weight. Loaded flexion plus rotation is the riskiest loading for the disc; it is kept in the library as an example of a risky movement.',
    cues: [
      'Remove this movement from the program; use the Pallof press instead',
      'If you must, do it without weight, rotate from your chest and lock your lower back',
      "Keep your feet on the floor; don't lean your torso back",
    ],
  },
};
