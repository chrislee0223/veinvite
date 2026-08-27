import type { Metadata } from 'next';

import {
  ParticipantsAdminClient,
} from '@/components/ParticipantsAdminClient';
import {
  WalletSessionGate,
} from '@/components/WalletSessionGate';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Participants',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ParticipantsAdminPage() {
  return (
    <WalletSessionGate>
      <ParticipantsAdminClient />
    </WalletSessionGate>
  );
}
