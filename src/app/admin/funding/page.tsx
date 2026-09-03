import type { Metadata } from 'next';

import {
  FundingAdminClient,
} from '@/components/FundingAdminClient';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Funding Split',
};

export default function FundingAdminPage() {
  return <FundingAdminClient />;
}
