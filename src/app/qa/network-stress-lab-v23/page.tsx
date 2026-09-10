import { QaNetworkStressLabV23 } from '@/qa/QaNetworkStressLabV23';

// QA-only route for the soft-curve stress lab. Production remains untouched.
export default function Page() {
  return <QaNetworkStressLabV23 />;
}
