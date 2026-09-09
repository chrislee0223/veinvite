import { QaNetworkZoomV4 } from '@/qa/QaNetworkZoomV4';

export const dynamic = 'force-dynamic';

// QA-only route. Keep Production isolated while reviewing Network zoom behavior.
export default function NetworkZoomV4Page() {
  return <QaNetworkZoomV4 />;
}
