import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  getVeChainExplorerAddressUrl,
  getVeChainExplorerTransactionUrl,
} from '@/lib/vechainExplorer';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'VeInvite Reward Proof',
  robots: {
    index: false,
    follow: false,
  },
};

const MANIFEST_VERSION = 'veinvite-payout-manifest-v3';
const PROOF_DESCRIPTION =
  'VeInvite verified referral onboarding reward.';
const PUBLIC_PROOF_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ImpactEvent = {
  event_type: string;
  app_id: string | null;
  tx_id: string | null;
  block_number: number | string | null;
  block_timestamp: string | null;
  vote_round_id: number | string | null;
  tx_index: number | string | null;
  clause_index: number | string | null;
  id: number | string;
};

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
  publicProofId: string,
) {
  if (!Array.isArray(clauses)) {
    return null;
  }

  const clause = clauses.find(
    (value) =>
      isRecord(value) &&
      String(value.payoutId ?? '') === payoutId &&
      String(value.publicProofId ?? '').toLowerCase() ===
        publicProofId,
  );

  if (!isRecord(clause)) {
    return null;
  }

  const expectedProof =
    `veinvite:referral-onboarding:v2:proof:${publicProofId}`;
  const expectedUrl =
    `https://veinvite.vercel.app/proofs/${publicProofId}`;
  const proofTypes = clause.proofTypes;
  const proofValues = clause.proofValues;

  if (
    clause.proof !== expectedProof ||
    clause.publicProofId !== publicProofId ||
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

function formatDate(raw: unknown): string {
  const date = new Date(String(raw ?? ''));

  if (Number.isNaN(date.getTime())) {
    return 'Pending';
  }

  return date.toISOString();
}

function shortenHex(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function orderImpactEvents(
  left: ImpactEvent,
  right: ImpactEvent,
) {
  const leftBlock = Number(left.block_number ?? Number.MAX_SAFE_INTEGER);
  const rightBlock = Number(right.block_number ?? Number.MAX_SAFE_INTEGER);
  if (leftBlock !== rightBlock) return leftBlock - rightBlock;

  const leftTx = Number(left.tx_index ?? Number.MAX_SAFE_INTEGER);
  const rightTx = Number(right.tx_index ?? Number.MAX_SAFE_INTEGER);
  if (leftTx !== rightTx) return leftTx - rightTx;

  const leftClause = Number(left.clause_index ?? Number.MAX_SAFE_INTEGER);
  const rightClause = Number(right.clause_index ?? Number.MAX_SAFE_INTEGER);
  if (leftClause !== rightClause) return leftClause - rightClause;

  return Number(left.id) - Number(right.id);
}

export default async function RewardProofPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId: rawProofId } = await params;
  const publicProofId = rawProofId.trim().toLowerCase();

  if (!PUBLIC_PROOF_ID_PATTERN.test(publicProofId)) {
    notFound();
  }

  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select(
      'id, round_id, invite_code, public_proof_id, recipient_wallet, status, tx_id, paid_at',
    )
    .eq('public_proof_id', publicProofId)
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

  const payoutId = String(payout.id);
  const manifestResult = await supabaseAdmin
    .from('reward_payout_manifests')
    .select('manifest_version, network, clauses')
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
    publicProofId,
  );

  if (!proof) {
    notFound();
  }

  const receiptResult = await supabaseAdmin
    .from('reward_receipts')
    .select('tx_id, paid_at, network')
    .eq('payout_id', payoutId)
    .maybeSingle();

  if (receiptResult.error) {
    throw new Error(
      `Reward proof receipt could not be loaded: ${receiptResult.error.message}`,
    );
  }

  const invitationResult = await supabaseAdmin
    .from('invitations')
    .select(
      'invitee_wallet, status, apps_completed, vote_completed, vote_round_id, vote_completed_at',
    )
    .eq('invite_code', payout.invite_code)
    .maybeSingle();

  if (invitationResult.error) {
    throw new Error(
      `Reward proof invitation could not be loaded: ${invitationResult.error.message}`,
    );
  }

  const invitation = invitationResult.data;

  if (!invitation?.invitee_wallet) {
    notFound();
  }

  const inviteeWallet = String(invitation.invitee_wallet).toLowerCase();

  const impactResult = await supabaseAdmin
    .from('invite_impact_events')
    .select(
      'id, event_type, app_id, tx_id, block_number, block_timestamp, vote_round_id, tx_index, clause_index',
    )
    .eq('invite_code', payout.invite_code)
    .eq('wallet_address', inviteeWallet)
    .in('event_type', ['DAPP_REWARD', 'ALLOCATION_VOTE']);

  if (impactResult.error) {
    throw new Error(
      `Reward proof mission evidence could not be loaded: ${impactResult.error.message}`,
    );
  }

  const impactEvents = ((impactResult.data ?? []) as ImpactEvent[])
    .slice()
    .sort(orderImpactEvents);
  const seenApps = new Set<string>();
  const qualifyingAppEvents = impactEvents.filter((event) => {
    if (event.event_type !== 'DAPP_REWARD' || !event.app_id) {
      return false;
    }

    const appId = event.app_id.toLowerCase();
    if (seenApps.has(appId)) {
      return false;
    }

    seenApps.add(appId);
    return true;
  }).slice(0, 3);

  const qualifyingAppIds = qualifyingAppEvents.map(
    (event) => String(event.app_id).toLowerCase(),
  );

  let dappNames = new Map<string, string>();

  if (qualifyingAppIds.length > 0) {
    const registryResult = await supabaseAdmin
      .from('vebetter_dapp_registry')
      .select('app_id, display_name')
      .in('app_id', qualifyingAppIds);

    if (registryResult.error) {
      throw new Error(
        `Reward proof dApp metadata could not be loaded: ${registryResult.error.message}`,
      );
    }

    dappNames = new Map(
      (registryResult.data ?? [])
        .filter((row) => row.display_name)
        .map((row) => [
          String(row.app_id).toLowerCase(),
          String(row.display_name),
        ]),
    );
  }

  const voteEvent = impactEvents.find(
    (event) =>
      event.event_type === 'ALLOCATION_VOTE' &&
      (invitation.vote_round_id === null ||
        String(event.vote_round_id ?? '') ===
          String(invitation.vote_round_id)),
  ) ?? impactEvents.find(
    (event) => event.event_type === 'ALLOCATION_VOTE',
  );

  const receipt = receiptResult.data;
  const network =
    (receipt?.network ?? manifest.network) === 'testnet'
      ? 'testnet'
      : 'mainnet';
  const txId = receipt?.tx_id ?? payout.tx_id;
  const finalized = Boolean(receipt);
  const recipientWallet =
    String(payout.recipient_wallet).toLowerCase();
  const requirementsComplete =
    invitation.status === 'COMPLETED' &&
    Number(invitation.apps_completed) >= 3 &&
    invitation.vote_completed === true &&
    qualifyingAppEvents.length >= 3 &&
    Boolean(voteEvent?.tx_id);

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
          maxWidth: 680,
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
            gridTemplateColumns: 'minmax(135px, 0.8fr) minmax(0, 1.8fr)',
            gap: '14px 18px',
            margin: '26px 0 0',
            paddingTop: 22,
            borderTop: '1px solid #eee5d7',
            fontSize: 14,
          }}
        >
          <dt style={{ color: '#766f64' }}>Proof ID</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {publicProofId}
          </dd>

          <dt style={{ color: '#766f64' }}>Referrer / reward recipient</dt>
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
              {shortenHex(recipientWallet)}
            </a>
          </dd>

          <dt style={{ color: '#766f64' }}>Referee wallet</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
            <a
              href={getVeChainExplorerAddressUrl(
                inviteeWallet,
                network,
              )}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#8a5900' }}
            >
              {inviteeWallet}
            </a>
          </dd>

          <dt style={{ color: '#766f64' }}>Referral requirements</dt>
          <dd style={{ margin: 0 }}>
            {requirementsComplete ? 'Completed ✓' : 'Evidence incomplete'}
          </dd>

          <dt style={{ color: '#766f64' }}>Network</dt>
          <dd style={{ margin: 0 }}>{network}</dd>

          <dt style={{ color: '#766f64' }}>Status</dt>
          <dd style={{ margin: 0 }}>
            {finalized ? 'Finalized / paid' : String(payout.status)}
          </dd>

          <dt style={{ color: '#766f64' }}>Paid at</dt>
          <dd style={{ margin: 0 }}>
            {formatDate(receipt?.paid_at ?? payout.paid_at)}
          </dd>

          {txId ? (
            <>
              <dt style={{ color: '#766f64' }}>Reward transaction</dt>
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
                  {shortenHex(String(txId))}
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        <section
          style={{
            marginTop: 26,
            paddingTop: 22,
            borderTop: '1px solid #eee5d7',
          }}
        >
          <h2 style={{ margin: '0 0 14px', fontSize: 19 }}>
            Qualifying dApps
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {qualifyingAppEvents.map((event, index) => {
              const appId = String(event.app_id).toLowerCase();
              const displayName = dappNames.get(appId);

              return (
                <div
                  key={`${appId}-${String(event.id)}`}
                  style={{
                    border: '1px solid #eee5d7',
                    borderRadius: 14,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {index + 1}. {displayName ?? 'VeBetter dApp'}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: '#766f64',
                      fontSize: 12,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {appId}
                  </div>
                  {event.tx_id ? (
                    <a
                      href={getVeChainExplorerTransactionUrl(
                        event.tx_id,
                        network,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block',
                        marginTop: 7,
                        color: '#8a5900',
                        fontSize: 13,
                      }}
                    >
                      View qualifying transaction
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section
          style={{
            marginTop: 26,
            paddingTop: 22,
            borderTop: '1px solid #eee5d7',
          }}
        >
          <h2 style={{ margin: '0 0 14px', fontSize: 19 }}>
            Governance vote
          </h2>
          {voteEvent?.tx_id ? (
            <div
              style={{
                border: '1px solid #eee5d7',
                borderRadius: 14,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontWeight: 800 }}>
                Allocation Voting · Round{' '}
                {String(
                  voteEvent.vote_round_id ??
                    invitation.vote_round_id ??
                    '—',
                )}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: '#766f64',
                  fontSize: 12,
                }}
              >
                {formatDate(
                  voteEvent.block_timestamp ??
                    invitation.vote_completed_at,
                )}
              </div>
              <a
                href={getVeChainExplorerTransactionUrl(
                  voteEvent.tx_id,
                  network,
                )}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: 7,
                  color: '#8a5900',
                  fontSize: 13,
                }}
              >
                View voting transaction
              </a>
            </div>
          ) : (
            <div style={{ color: '#766f64', fontSize: 14 }}>
              Voting evidence unavailable.
            </div>
          )}
        </section>

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
          This record shows the public on-chain referral activity used for
          VeInvite reward qualification. It does not certify a unique human
          identity. Device data, IP information, location data, and internal
          anti-abuse signals are intentionally excluded.
        </p>
      </section>
    </main>
  );
}
