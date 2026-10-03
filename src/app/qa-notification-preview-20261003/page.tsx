import type { Metadata } from 'next';

import { NotificationUiPreview } from '@/components/NotificationUiPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Notification Preview',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function NotificationPreviewPage() {
  return <NotificationUiPreview />;
}
