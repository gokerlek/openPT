import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.ts';
import { measurementsMessages } from '../../i18n/messages/measurements/index.ts';

export const POSE_TASKS=['front','side','squat','knee','hinge','shoulder_flexion','shoulder_abduction','elbow','sit_stand'] as const;
export type PoseTask=(typeof POSE_TASKS)[number];
export const POSE_PROTOCOL=2 as const;
/** Çekim yönü (kod); ekrandaki adı `viewLabels(locale)`. */
export type PoseView='front'|'side';
export type PoseProtocol={id:PoseTask;title:string;subtitle:string;view:PoseView;dynamic:boolean;primary:string;direction:1|-1;metrics:readonly string[];instructions:readonly string[]};
/** Protokolün metin dışı kuralları; başlık, alt başlık ve yönergeler sözlükte. */
const RULES:Record<PoseTask,Omit<PoseProtocol,'title'|'subtitle'|'instructions'>>={
 front:{id:'front',view:'front',dynamic:false,primary:'shoulder_tilt',direction:1,metrics:['shoulder_tilt','hip_tilt','trunk_tilt']},
 side:{id:'side',view:'side',dynamic:false,primary:'trunk_tilt',direction:1,metrics:['trunk_tilt']},
 squat:{id:'squat',view:'side',dynamic:true,primary:'near_knee',direction:-1,metrics:['near_knee','trunk_tilt']},
 knee:{id:'knee',view:'side',dynamic:true,primary:'near_knee',direction:-1,metrics:['near_knee']},
 hinge:{id:'hinge',view:'side',dynamic:true,primary:'near_hip',direction:-1,metrics:['near_hip','trunk_tilt']},
 shoulder_flexion:{id:'shoulder_flexion',view:'side',dynamic:true,primary:'near_shoulder',direction:1,metrics:['near_shoulder','trunk_tilt']},
 shoulder_abduction:{id:'shoulder_abduction',view:'front',dynamic:true,primary:'left_shoulder',direction:1,metrics:['left_shoulder','right_shoulder','trunk_tilt']},
 elbow:{id:'elbow',view:'side',dynamic:true,primary:'near_elbow',direction:-1,metrics:['near_elbow']},
 sit_stand:{id:'sit_stand',view:'side',dynamic:true,primary:'near_knee',direction:-1,metrics:['near_knee','trunk_tilt']},
};

/** Protokoller, metinleri okuyanın dilinde. */
export function protocols(locale: Locale = DEFAULT_LOCALE): Record<PoseTask, PoseProtocol> {
 const text=measurementsMessages(locale).camera.protocols;
 return Object.fromEntries(POSE_TASKS.map((id):[PoseTask,PoseProtocol]=>[id,{...RULES[id],title:text[id].title,subtitle:text[id].subtitle,instructions:text[id].instructions}])) as Record<PoseTask,PoseProtocol>;
}

/** Türkçe protokoller (eski çağrılar ve metin dışı kurallar); arayüz `protocols(locale)` kullanır. */
export const PROTOCOLS:Record<PoseTask,PoseProtocol>=protocols('tr');

/** Açıların kısa adları okuyanın dilinde. */
export function metricLabels(locale: Locale = DEFAULT_LOCALE): Record<string, string> {
 return measurementsMessages(locale).camera.metrics;
}

export const METRIC_LABELS: Record<string, string> = metricLabels('tr');

/** Çekim yönünün adı ("Önden", "Yandan"). */
export function viewLabels(locale: Locale = DEFAULT_LOCALE): Record<PoseView, string> {
 return measurementsMessages(locale).camera.views;
}
