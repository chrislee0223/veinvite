import { InviteeClient } from '@/components/InviteeClient';
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
      <InviteeClient code={normalizedCode} />
    </WalletSessionGate>
  );
}
