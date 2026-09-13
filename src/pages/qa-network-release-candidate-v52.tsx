import dynamic from 'next/dynamic';
import Head from 'next/head';

const Candidate = dynamic(
  () => import('@/qa/QaNetworkReleaseCandidateV52').then((module) => module.QaNetworkReleaseCandidateV52),
  {
    ssr: false,
    loading: () => (
      <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#080807',color:'#817a6f',fontFamily:'system-ui,sans-serif',fontSize:'13px'}}>
        Loading final network candidate…
      </main>
    ),
  },
);

export default function NetworkReleaseCandidateV52Page() {
  return (
    <>
      <Head>
        <title>VeInvite Network Final QA</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Candidate />
    </>
  );
}
