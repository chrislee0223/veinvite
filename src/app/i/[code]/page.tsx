import { InviteeClient } from '@/components/InviteeClient';

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteeClient code={code.toUpperCase()} />;
}
