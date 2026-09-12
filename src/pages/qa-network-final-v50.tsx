import dynamic from 'next/dynamic';
import Head from 'next/head';

const InteractivePreview = dynamic(
  () => import('@/qa/QaNetworkFinalInteractivePreviewV50').then((module) => module.QaNetworkFinalInteractivePreviewV50),
  {
    ssr: false,
    loading: () => (
      <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#080807',color:'#8e877b',fontFamily:'system-ui,sans-serif',fontSize:'13px'}}>
        Loading interactive network preview…
      </main>
    ),
  },
);

export default function NetworkFinalV50Page() {
  return (
    <>
      <Head>
        <title>VeInvite Network Interactive Preview</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <InteractivePreview />
    </>
  );
}
