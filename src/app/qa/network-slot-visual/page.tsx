import { QaNetworkI18nStateHarness } from '@/qa/QaNetworkI18nStateHarness';

export const dynamic = 'force-dynamic';

export default function QaNetworkSlotVisualPage() {
  return (
    <QaNetworkI18nStateHarness
      stateId="NETWORK-I18N-PUBLIC"
      locale="ko"
    />
  );
}
