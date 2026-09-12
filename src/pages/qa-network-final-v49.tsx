import Head from 'next/head';

import { QaNetworkFinalProductionPreviewV49 } from '@/qa/QaNetworkFinalProductionPreviewV49';

export default function NetworkFinalV49Page() {
  return (
    <>
      <Head>
        <title>VeInvite Network Final Preview</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <QaNetworkFinalProductionPreviewV49 />
    </>
  );
}
