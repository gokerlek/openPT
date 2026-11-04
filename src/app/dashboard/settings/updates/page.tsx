import type {Metadata} from 'next';
import {Suspense} from 'react';
import {requirePt} from '@/lib/guards';
import {PageHeader} from '@/components/page-header';
import {currentVersion} from '@/lib/updates/github';
import {GithubAppNotice} from './github-app-notice';
import {UpdatePanel} from './update-panel';
export const metadata:Metadata={title:'Sürüm'};
export default async function UpdatesPage() {
  await requirePt();
  return <div className="flex max-w-2xl flex-col gap-6"><PageHeader title="Sürüm" description="Kurulu sürümü görüntüle, yeni sürümleri kontrol et ve uygulamanı güncelle." /><Suspense fallback={null}><GithubAppNotice /></Suspense><UpdatePanel current={currentVersion} /></div>;
}
