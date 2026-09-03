import type { Metadata } from 'next';

import {
  ParticipantsAdminClient,
} from '@/components/ParticipantsAdminClient';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Participants',
};

export default function ParticipantsAdminPage() {
  return <ParticipantsAdminClient />;
}
