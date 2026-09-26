import Link from 'next/link';

import { QaStateInventoryPanel } from '@/qa/QaStateInventoryPanel';
import { QaStudio } from '@/qa/QaStudio';

export default function QaStudioPage() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 1000,
        }}
      >
        <Link
          href="/qa/sybil-e2e"
          style={{
            display: 'inline-flex',
            minHeight: 42,
            alignItems: 'center',
            borderRadius: 999,
            padding: '0 16px',
            background: '#fff',
            color: '#111',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow:
              '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          Sybil E2E QA
        </Link>
      </div>
      <QaStudio />
      <QaStateInventoryPanel />
    </>
  );
}
