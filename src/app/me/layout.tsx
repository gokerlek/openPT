import type { Metadata } from 'next';
import { requireClient } from '@/lib/guards';
import { CoachLauncher } from '@/components/coach/coach-launcher';
import { clientManifestHref } from '@/lib/client-manifest';
import { readClientSession } from '@/lib/session';

/** Ana ekrana eklenen uygulama danışanı tanısın: manifest oturumdaki kimlikle bağlanır (`lib/client-manifest.ts`). */
export async function generateMetadata(): Promise<Metadata> {
  const session = await readClientSession();
  return { manifest: clientManifestHref(session?.clientId) };
}

export default async function ClientCoachLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClient();
  return <>{children}<CoachLauncher role="client" clientId={session.clientId} /></>;
}
