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
  title: 'VeInvite X Promotion Proof',
  robots: {
    index: false,
    follow: false,
  },
};

const MANIFEST_VERSION =
  'veinvite-x-promotion-payout-manifest-v1';
const PROOF_DESCRIPTION =
  'VeInvite verified X promotion bonus.';
const PUBLIC_PROOF_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function verifyManifestClause(
  clause: unknown,
  args: {
    intentId: string;
    inviteCode: string;
    recipientWallet: string;
    amountWei: string;
    publicProofId: string;
    appId: string;
    poolAddress: string;
  },
) {
  if (!isRecord(clause)) {
    return false;
  }

  const proofText =
    `veinvite:x-promotion:v1:proof:${args.publicProofId}`;
  const proofLink =
    `https://veinvite.vercel.app/promotion-proofs/${args.publicProofId}`;
  const proofTypes = clause.proofTypes;
  const proofValues = clause.proofValues;
  const impactCodes = clause.impactCodes;
  const impactValues = clause.impactValues;

  return (
    String(clause.intentId ?? '') === args.intentId &&
    String(clause.inviteCode ?? '') === args.inviteCode &&
    String(clause.recipientWallet ?? '').toLowerCase() ===
      args.recipientWallet &&
    String(clause.amountWei ?? '') === args.amountWei &&
    String(clause.publicProofId ?? '').toLowerCase() ===
      args.publicProofId &&
    clause.proof === proofText &&
    clause.description === PROOF_DESCRIPTION &&
    String(clause.appId ?? '').toLowerCase() === args.appId &&
    String(clause.to ?? '').toLowerCase() === args.poolAddress &&
    clause.value === '0x0' &&
    typeof clause.data === 'string' &&
    /^0x[0-9a-f]+$/u.test(clause.data) &&
    Array.isArray(proofTypes) &&
    proofTypes.length === 2 &&
    proofTypes[0] === 'text' &&
    proofTypes[1] === 'link' &&
    Array.isArray(proofValues) &&
    proofValues.length === 2 &&
    proofValues[0] === proofText &&
    proofValues[1] === proofLink &&
    Array.isArray(impactCodes) &&
    impactCodes.length === 0 &&
    Array.isArray(impactValues) &&
    impactValues.length === 0
  );
}

function formatWeiB3tr(value: string): string {
  const wei = BigInt(value);
  const whole = wei / 10n ** 18n;
  const fraction =
    (wei % 10n ** 18n)
      .toString()
      .padStart(18, '0')
      .replace(/0+$/u, '');

  return fraction
    ? `${whole}.${fraction}`
    : whole.toString();
}

function formatDate(raw: unknown): string {
  const date = new Date(String(raw ?? ''));

  return Number.isNaN(date.getTime())
    ? 'Pending'
    : date.toISOString();
}

function shortenHex(value: string): string {
  return value.length <= 18
    ? value
    : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default async function XPromotionProofPage({
  params,
}: {
  params: Promise<{ proofId: string }>;
}) {
  const { proofId: rawProofId } = await params;
  const publicProofId =
    rawProofId.trim().toLowerCase();

  if (!PUBLIC_PROOF_ID_PATTERN.test(publicProofId)) {
    notFound();
  }

  const manifestResult = await supabaseAdmin
    .from('reward_x_promotion_payout_manifests')
    .select(
      'id,intent_id,manifest_version,network,app_id,x2earn_rewards_pool_address,invite_code,recipient_wallet,amount_wei,public_proof_id,proof_text,proof_link,description,clause,created_at',
    )
    .eq('public_proof_id', publicProofId)
    .maybeSingle();

  if (manifestResult.error) {
    throw new Error(
      `X promotion proof manifest could not be loaded: ${manifestResult.error.message}`,
    );
  }

  const manifest = manifestResult.data;

  if (
    !manifest ||
    manifest.manifest_version !== MANIFEST_VERSION ||
    String(manifest.public_proof_id).toLowerCase() !== publicProofId ||
    manifest.proof_text !==
      `veinvite:x-promotion:v1:proof:${publicProofId}` ||
    manifest.proof_link !==
      `https://veinvite.vercel.app/promotion-proofs/${publicProofId}` ||
    manifest.description !== PROOF_DESCRIPTION
  ) {
    notFound();
  }

  const recipientWallet =
    String(manifest.recipient_wallet).toLowerCase();
  const appId =
    String(manifest.app_id).toLowerCase();
  const poolAddress =
    String(manifest.x2earn_rewards_pool_address).toLowerCase();
  const amountWei =
    BigInt(String(manifest.amount_wei)).toString();
  const intentId =
    String(manifest.intent_id);

  if (
    !verifyManifestClause(
      manifest.clause,
      {
        intentId,
        inviteCode:
          String(manifest.invite_code),
        recipientWallet,
        amountWei,
        publicProofId,
        appId,
        poolAddress,
      },
    )
  ) {
    notFound();
  }

  const [intentResult, receiptResult] =
    await Promise.all([
      supabaseAdmin
        .from('reward_x_promotion_payout_intents')
        .select(
          'id,x_post_id,recipient_wallet,amount_wei,public_proof_id',
        )
        .eq('id', intentId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_x_promotion_receipts')
        .select(
          'intent_id,recipient_wallet,amount_wei,public_proof_id,x_post_id,tx_id,paid_at,network',
        )
        .eq('public_proof_id', publicProofId)
        .maybeSingle(),
    ]);

  if (intentResult.error) {
    throw new Error(
      `X promotion proof intent could not be loaded: ${intentResult.error.message}`,
    );
  }

  if (receiptResult.error) {
    throw new Error(
      `X promotion proof receipt could not be loaded: ${receiptResult.error.message}`,
    );
  }

  const intent = intentResult.data;
  const receipt = receiptResult.data;

  if (
    !intent ||
    String(intent.id) !== intentId ||
    String(intent.public_proof_id).toLowerCase() !== publicProofId ||
    String(intent.recipient_wallet).toLowerCase() !== recipientWallet ||
    BigInt(String(intent.amount_wei)).toString() !== amountWei
  ) {
    notFound();
  }

  if (
    receipt &&
    (
      String(receipt.intent_id) !== intentId ||
      String(receipt.public_proof_id).toLowerCase() !== publicProofId ||
      String(receipt.recipient_wallet).toLowerCase() !== recipientWallet ||
      BigInt(String(receipt.amount_wei)).toString() !== amountWei ||
      String(receipt.x_post_id) !== String(intent.x_post_id)
    )
  ) {
    notFound();
  }

  const network =
    manifest.network === 'testnet' ||
    manifest.network === 'testnet-staging'
      ? 'testnet'
      : 'mainnet';
  const finalized = Boolean(receipt);
  const txId =
    receipt?.tx_id
      ? String(receipt.tx_id)
      : null;
  const xPostId =
    String(intent.x_post_id);

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
          boxShadow:
            '0 12px 36px rgba(17,17,17,0.06)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '7px 11px',
            borderRadius: 999,
            background:
              finalized ? '#eefbf2' : '#fff5dc',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {finalized
            ? 'Verified on-chain'
            : 'Proof prepared'}
        </div>

        <h1
          style={{
            margin: '18px 0 8px',
            fontSize: 30,
            lineHeight: 1.15,
          }}
        >
          VeInvite X Promotion Proof
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
            gridTemplateColumns:
              'minmax(135px, 0.8fr) minmax(0, 1.8fr)',
            gap: '14px 18px',
            margin: '26px 0 0',
            paddingTop: 22,
            borderTop: '1px solid #eee5d7',
            fontSize: 14,
          }}
        >
          <dt style={{ color: '#766f64' }}>
            Proof ID
          </dt>
          <dd
            style={{
              margin: 0,
              overflowWrap: 'anywhere',
            }}
          >
            {publicProofId}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Reward
          </dt>
          <dd style={{ margin: 0 }}>
            {formatWeiB3tr(amountWei)} B3TR
          </dd>

          <dt style={{ color: '#766f64' }}>
            Recipient
          </dt>
          <dd
            style={{
              margin: 0,
              overflowWrap: 'anywhere',
            }}
          >
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

          <dt style={{ color: '#766f64' }}>
            X Post
          </dt>
          <dd style={{ margin: 0 }}>
            <a
              href={`https://x.com/i/web/status/${xPostId}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#8a5900' }}
            >
              View verified Post
            </a>
          </dd>

          <dt style={{ color: '#766f64' }}>
            Network
          </dt>
          <dd style={{ margin: 0 }}>
            {network}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Status
          </dt>
          <dd style={{ margin: 0 }}>
            {finalized
              ? 'Finalized / paid'
              : 'Prepared / not yet finalized'}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Manifest created
          </dt>
          <dd style={{ margin: 0 }}>
            {formatDate(manifest.created_at)}
          </dd>

          {receipt ? (
            <>
              <dt style={{ color: '#766f64' }}>
                Paid at
              </dt>
              <dd style={{ margin: 0 }}>
                {formatDate(receipt.paid_at)}
              </dd>
            </>
          ) : null}

          {txId ? (
            <>
              <dt style={{ color: '#766f64' }}>
                Promotion transaction
              </dt>
              <dd
                style={{
                  margin: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                <a
                  href={getVeChainExplorerTransactionUrl(
                    txId,
                    network,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#8a5900' }}
                >
                  {shortenHex(txId)}
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
          This record proves an X Promotion bonus associated
          with a verified public Post. It is separate from the
          VeInvite referral-onboarding reward and does not count
          as an additional referral.
        </p>
      </section>
    </main>
  );
}
