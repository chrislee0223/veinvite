import type { Metadata } from 'next';

import { InviteeClient } from '@/components/InviteeClient';

export const metadata: Metadata = {
  title: 'VeInvite Mission Progress Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function MissionProgressPreviewPage() {
  return <InviteeClient code="PREVIEW" />;
}
