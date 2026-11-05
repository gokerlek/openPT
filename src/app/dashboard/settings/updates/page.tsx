import type {Metadata} from 'next';
import {Suspense} from 'react';
import {requirePt} from '@/lib/guards';
import {PageHeader} from '@/components/page-header';
import {ptShellMessages} from '@/i18n/messages/pt-shell';
import {getLocale} from '@/i18n/server';
import {currentVersion} from '@/lib/updates/github';
import {GithubAppNotice} from './github-app-notice';
import {UpdatePanel} from './update-panel';
export async function generateMetadata():Promise<Metadata>{return {title:ptShellMessages(await getLocale()).settings.updates.title};}
export default async function UpdatesPage() {
  await requirePt();
  const t=ptShellMessages(await getLocale()).settings.updates;
  return <div className="flex max-w-2xl flex-col gap-6"><PageHeader title={t.title} description={t.description} /><Suspense fallback={null}><GithubAppNotice /></Suspense><UpdatePanel current={currentVersion} /></div>;
}
