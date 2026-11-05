/**
 * Hazır cihaz kataloğunun İngilizce adları ve notları (US İngilizcesi), `device-library.ts` ile aynı kimliklerle.
 * `notes` yalnız Türkçe kaynakta notu olan cihazlarda vardır. PT'nin kendi ya da ezdiği cihazlar bu tabloya girmez.
 */
export type DeviceTextEn = { name: string; notes?: string };

export const DEVICE_LIBRARY_EN: Readonly<Record<string, DeviceTextEn>> = {
  // Free weights
  'olimpik-bar': { name: 'Olympic barbell', notes: 'The smallest plate is 1.25 kg (2.5 kg across both sides).' },
  'ez-bar': { name: 'EZ bar' },
  'dambil-seti': { name: 'Dumbbell set' },
  'kettlebell-seti': { name: 'Kettlebell set' },

  // Cable
  'kablo-istasyonu': { name: 'Cable station (single pulley)' },
  'fonksiyonel-kablo': { name: 'Functional trainer (dual pulley)', notes: 'Dual pulley: you feel half of the selected weight.' },

  // Selectorized machines
  'lat-pulldown-makinesi': { name: 'Lat pulldown machine' },
  'oturarak-row-makinesi': { name: 'Seated row machine' },
  'chest-press-makinesi': { name: 'Chest press machine' },
  'pec-deck': { name: 'Pec deck (butterfly)', notes: 'On most models, sitting facing backward also works the rear delts.' },
  'shoulder-press-makinesi': { name: 'Shoulder press machine' },
  'yana-acis-makinesi': { name: 'Lateral raise machine' },
  'preacher-curl-makinesi': { name: 'Preacher curl machine' },
  'triceps-makinesi': { name: 'Triceps machine' },
  'leg-extension-makinesi': { name: 'Leg extension machine' },
  'yatarak-leg-curl-makinesi': { name: 'Lying leg curl machine' },
  'oturarak-leg-curl-makinesi': { name: 'Seated leg curl machine' },
  'abductor-makinesi': { name: 'Abductor machine (hip abduction)' },
  'adductor-makinesi': { name: 'Adductor machine (hip adduction)' },
  'ayakta-calf-makinesi': { name: 'Standing calf raise machine' },
  'glute-kickback-makinesi': { name: 'Glute kickback machine' },
  'crunch-makinesi': { name: 'Crunch machine' },
  'rotary-torso': { name: 'Rotary torso machine' },

  // Plate-loaded machines
  'leg-press': { name: 'Leg press (45°)', notes: 'Sled weight varies by model.' },
  'hack-squat': { name: 'Hack squat machine' },
  'smith-makinesi': { name: 'Smith machine', notes: 'On counterbalanced bars, the bar weighs less.' },
  'hip-thrust-makinesi': { name: 'Hip thrust machine' },
  't-bar-row': { name: 'T-bar row' },

  // Bodyweight stations and band
  'barfiks-bari': { name: 'Pull-up bar' },
  'paralel-bar': { name: 'Parallel bars (dips)' },
  'hiperekstansiyon-sehpasi': { name: 'Hyperextension bench', notes: 'Hold a plate against your chest to make it harder.' },
  'direnc-bandi': { name: 'Resistance band' },

  // Cardio
  'kosu-bandi': { name: 'Treadmill' },
  'sabit-bisiklet': { name: 'Stationary bike' },
  'eliptik': { name: 'Elliptical' },
  'kurek-ergometresi': { name: 'Rowing machine' },
  'merdiven': { name: 'Stepmill (stair climber)' },
  'air-bike': { name: 'Air bike' },
};
