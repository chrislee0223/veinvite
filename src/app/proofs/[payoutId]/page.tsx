import { formatUnits } from 'ethers';
import { notFound } from 'next/navigation';

import {
  getVeChainExplorerAddressUrl,
  getVeChainExplorerTransactionUrl,
} from '@/lib/vechainExplorer';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MANIFEST_VERSION = 'veinvite-payout-manifest-v3';
const PROOF_DESCRIPTION =
  'VeInvite verified referral onboarding reward.';
const PAYOUT_ID_PATTERN = /^[1-9][0-9]*$/;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function findProofClause(
  clauses: unknown,
  payoutId: string,
) {
  if (!Array.isArray(clauses)) {
    return null;
  }

  const clause = clauses.find(
    (value) =>
      isRecord(value) &&
      String(value.payoutId ?? '') === payoutId,
  );

  if (!isRecord(clause)) {
    return null;
  }

  const expectedProof =
    `veinvite:referral-onboarding:v2:payout:${payoutId}`;
  const expectedUrl =
    `https://veinvite.vercel.app/proofs/${payoutId}`;
  const proofTypes = clause.proofTypes;
  const proofValues = clause.proofValues;

  if (
    clause.proof !== expectedProof ||
    !Array.isArray(proofTypes) ||
    proofTypes.length !== 2 ||
    proofTypes[0] !== 'text' ||
    proofTypes[1] !== 'link' ||
    !Array.isArray(proofValues) ||
    proofValues.length !== 2 ||
    proofValues[0] !== expectedProof ||
    proofValues[1] !== expectedUrl ||
    clause.description !== PROOF_DESCRIPTION
  ) {
    return null;
  }

  return {
    proof: expectedProof,
    url: expectedUrl,
  };
}

function formatB3tr(rawWei: unknown): string {
  try {
    return formatUnits(BigInt(String(rawWei)), 18);
  } catch {
    return String(rawWei ?? '');
  }
}

function formatDate(raw: unknown): string {
  const date = new Date(String(raw ?? ''));

  if (Number.isNaN(date.getTime())) {
    return 'Pending';
  }

  return date.toISOString();
}

export default async function RewardProofPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId: rawPayoutId } = await params;
  const payoutId = rawPayoutId.trim();

  if (!PAYOUT_ID_PATTERN.test(payoutId)) {
    notFound();
  }

  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select(
      'id, round_id, recipient_wallet, amount_wei, status, tx_id, created_at, paid_at',
    )
    .eq('id', payoutId)
    .maybeSingle();

  if (payoutResult.error) {
    throw new Error(
      `Reward proof payout could not be loaded: ${payoutResult.error.message}`,
    );
  }

  const payout = payoutResult.data;

  if (!payout) {
    notFound();
  }

  const manifestResult = await supabaseAdmin
    .from('reward_payout_manifests')
    .select(
      'manifest_version, network, clauses, created_at',
    )
    .eq('round_id', payout.round_id)
    .maybeSingle();

  if (manifestResult.error) {
    throw new Error(
      `Reward proof manifest could not be loaded: ${manifestResult.error.message}`,
    );
  }

  const manifest = manifestResult.data;

  if (
    !manifest ||
    manifest.manifest_version !== MANIFEST_VERSION
  ) {
    notFound();
  }

  const proof = findProofClause(
    manifest.clauses,
    payoutId,
  );

  if (!proof) {
    notFound();
  }

  const receiptResult = await supabaseAdmin
    .from('reward_receipts')
    .select('tx_id, paid_at, network, vebetter_round_id')
    .eq('payout_id', payoutId)
    .maybeSingle();

  if (receiptResult.error) {
    throw new Error(
      `Reward proof receipt could not be loaded: ${receiptResult.error.message}`,
    );
  }

  const receipt = receiptResult.data;
  const network =
    (receipt?.network ?? manifest.network) === 'testnet'
      ? 'testnet'
      : 'mainnet';
  const txId = receipt?.tx_id ?? payout.tx_id;
  const finalized = Boolean(receipt);
  const recipientWallet =
    String(payout.recipient_wallet).toLowerCase();
  const amount = formatB3tr(payout.amount_wei);

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#fffaf0',
        color: '#111111',
        padding: '32px 18px',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 620,
          margin: '0 auto',
          background: '#ffffff',
          border: '1px solid #eadfca',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 12px 36px rgba(17,17,17,0.06)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 11px',
            borderRadius: 999,
            background: finalized ? '#eefbf2' : '#fff5dc',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {finalized ? 'Verified on-chain' : 'Proof prepared'}
        </div>

        <h1
          style={{
            margin: '18px 0 8px',
            fontSize: 30,
            lineHeight: 1.15,
          }}
        >
          VeInvite Reward Proof
        </h1>
        <p
          style={{
            margin: 0,
            color: '#625d54',
            lineHeight: 1.6,
          }}
        >
          {PROOF_DESCRIPTION}
        </p>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 0.8fr) minmax(0, 1.8fr)',
            gap: '14px 18px',
            margin: '26px 0 0',
            paddingTop: 22,
            borderTop: '1px solid #eee5d7',
            fontSize: 14,
          }}
        >
          <dt style={{ color: '#766f64' }}>Proof ID</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{proof.proof}</dd>

          <dt style={{ color: '#766f64' }}>Payout ID</dt>
          <dd style={{ margin: 0 }}>{payoutId}</dd>

          <dt style={{ color: '#766f64' }}>Reward recipient</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
            <a
              href={getVeChainExplorerAddressUrl(
                recipientWallet,
                network,
              )}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#8a5900' }}
            >
              {recipientWallet}
            </a>
          </dd>

          <dt style={{ color: '#766f64' }}>Reward</dt>
          <dd style={{ margin: 0 }}>{amount} B3TR</dd>

          <dt style={{ color: '#766f64' }}>Network</dt>
          <dd style={{ margin: 0 }}>{network}</dd>

          <dt style={{ color: '#766f64' }}>Round</dt>
          <dd style={{ margin: 0 }}>
            {receipt?.vebetter_round_id
              ? String(receipt.vebetter_round_id)
              : String(payout.round_id)}
          </dd>

          <dt style={{ color: '#766f64' }}>Status</dt>
          <dd style={{ margin: 0 }}>
            {finalized ? 'Finalized / paid' : String(payout.status)}
          </dd>

          <dt style={{ color: '#766f64' }}>Manifest created</dt>
          <dd style={{ margin: 0 }}>{formatDate(manifest.created_at)}</dd>

          <dt style={{ color: '#766f64' }}>Paid at</dt>
          <dd style={{ margin: 0 }}>
            {formatDate(receipt?.paid_at ?? payout.paid_at)}
          </dd>

          {txId ? (
            <>
              <dt style={{ color: '#766f64' }}>Transaction</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                <a
                  href={getVeChainExplorerTransactionUrl(
                    String(txId),
                    network,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#8a5900' }}
                >
                  {String(txId)}
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        <p
          style={{
            margin: '24px 0 0',
            paddingTop: 18,
            borderTop: '1px solid #eee5d7',
            color: '#766f64',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          This public record intentionally excludes invitee identity,
          device data, IP information, and internal anti-abuse signals.
        </p>
      </section>
    </main>
  );
}
