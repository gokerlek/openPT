import type {Metadata} from 'next';
import {requirePt} from '@/lib/guards';
import {geminiKeyStatus} from '@/lib/ai/gemini-key';
import {getMessages} from '@/i18n/server';
import {coachMessages} from '@/i18n/messages/coach';
import {PageHeader} from '@/components/page-header';
import {GeminiSettings} from './gemini-settings';
import type {KeyStatus} from '@/lib/ai/credentials';

export async function generateMetadata():Promise<Metadata> {
  return {title:(await getMessages(coachMessages)).settings.title};
}
export default async function AiSettingsPage() {
  await requirePt();
  const t=(await getMessages(coachMessages)).settings;
  let status:KeyStatus|null=null;
  try{status=await geminiKeyStatus();}catch{/* Allow re-entry after AUTH_SECRET rotation; don't reveal provider errors. */}
  return <div className="flex flex-col gap-6"><PageHeader title={t.title} description={t.description} /><GeminiSettings initial={status} /></div>;
}
