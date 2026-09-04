import type { Metadata } from 'next';

import { MissionProgressLivePreview } from '@/components/MissionProgressLivePreview';

export const metadata: Metadata = {
  title: 'VeInvite Mission Progress Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function MissionProgressPreviewPage() {
  return <MissionProgressLivePreview />;
}
