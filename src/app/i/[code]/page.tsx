import { InviteeClient } from '@/components/InviteeClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <WalletSessionGate>
      <InviteeClient code={code.toUpperCase()} />
    </WalletSessionGate>
  );
}
