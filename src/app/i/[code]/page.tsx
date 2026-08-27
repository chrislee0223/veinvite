import { InviteeClient } from '@/components/InviteeClient';
import { InviteeReviewAutoRefresh } from '@/components/InviteeReviewAutoRefresh';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();

  return (
    <WalletSessionGate>
      <InviteeReviewAutoRefresh
        code={normalizedCode}
      />
      <InviteeClient code={normalizedCode} />
    </WalletSessionGate>
  );
}
