import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildRewardXPromotionProof,
  normalizeRewardXPromotionPublicProofId,
  VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
} from '@/lib/rewards/rewardXPromotionProof';
import {
  getVeChainExplorerAddressUrl,
  getVeChainExplorerTransactionUrl,
} from '@/lib/vechainExplorer';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'VeInvite X Promotion Proof',
  robots: { index: false, follow: false },
};

const B3TR_SCALE = 10n ** 18n;

function formatDate(raw: unknown): string {
  const date = new Date(String(raw ?? ''));
  return Number.isNaN(date.getTime())
    ? 'Pending'
    : date.toISOString();
}

function shorten(value: string): string {
  return value.length <= 18
    ? value
    : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatB3tr(raw: unknown): string {
  const value = String(raw ?? '');
  if (!/^\d+$/.test(value)) return '—';

  const amount = BigInt(value);
  const whole = amount / B3TR_SCALE;
  const remainder = amount % B3TR_SCALE;

  if (remainder === 0n) return whole.toString();

  const fraction = remainder
    .toString()
    .padStart(18, '0')
    .replace(/0+$/u, '');

  return `${whole}.${fraction}`;
}

function safeXUrl(
  raw: unknown,
  expectedPostId: string,
): string | null {
  try {
    const url = new URL(String(raw ?? ''));
    const allowedHosts = new Set([
      'x.com',
      'www.x.com',
      'twitter.com',
      'www.twitter.com',
    ]);

    return url.protocol === 'https:' &&
      allowedHosts.has(url.hostname.toLowerCase()) &&
      url.pathname.split('/').includes(expectedPostId)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="proofFact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function RewardXPromotionProofPage({
  params,
}: {
  params: Promise<{ proofId: string }>;
}) {
  const { proofId: rawProofId } = await params;
  let publicProofId: string;

  try {
    publicProofId =
      normalizeRewardXPromotionPublicProofId(rawProofId);
  } catch {
    notFound();
  }

  const proof = buildRewardXPromotionProof(publicProofId);

  const intentResult = await supabaseAdmin
    .from('reward_x_promotion_payout_intents')
    .select(
      'id, verification_id, network, recipient_wallet, amount_wei, source_reward_cohort_round_id, x_post_id, x_author_id, public_proof_id',
    )
    .eq('public_proof_id', publicProofId)
    .maybeSingle();

  if (intentResult.error) {
    throw new Error(
      `X promotion proof intent could not be loaded: ${intentResult.error.message}`,
    );
  }

  const intent = intentResult.data;

  if (
    !intent ||
    String(intent.public_proof_id ?? '').toLowerCase() !==
      publicProofId
  ) {
    notFound();
  }

  const verificationResult = await supabaseAdmin
    .from('reward_x_promotion_post_verifications')
    .select(
      'submission_id, x_post_id, x_author_id, final_verified_at, verification_state, invalidated_at',
    )
    .eq('id', intent.verification_id)
    .maybeSingle();

  if (verificationResult.error) {
    throw new Error(
      `X promotion proof verification could not be loaded: ${verificationResult.error.message}`,
    );
  }

  const verification = verificationResult.data;

  if (
    !verification ||
    verification.verification_state !== 'FINAL_VERIFIED' ||
    verification.final_verified_at === null ||
    verification.invalidated_at !== null ||
    String(verification.x_post_id) !== String(intent.x_post_id) ||
    String(verification.x_author_id) !== String(intent.x_author_id)
  ) {
    notFound();
  }

  const [submissionResult, receiptResult] = await Promise.all([
    supabaseAdmin
      .from('reward_x_promotion_post_submissions')
      .select('submitted_post_url')
      .eq('id', verification.submission_id)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_x_promotion_receipts')
      .select(
        'tx_id, paid_at, amount_wei, network, recipient_wallet, public_proof_id, x_post_id, x_author_id',
      )
      .eq('intent_id', intent.id)
      .maybeSingle(),
  ]);

  if (submissionResult.error) {
    throw new Error(
      `X promotion proof submission could not be loaded: ${submissionResult.error.message}`,
    );
  }
  if (receiptResult.error) {
    throw new Error(
      `X promotion proof receipt could not be loaded: ${receiptResult.error.message}`,
    );
  }

  const receipt = receiptResult.data;

  if (
    receipt &&
    (
      String(receipt.public_proof_id ?? '').toLowerCase() !==
        publicProofId ||
      String(receipt.amount_wei) !== String(intent.amount_wei) ||
      String(receipt.network) !== String(intent.network) ||
      String(receipt.recipient_wallet).toLowerCase() !==
        String(intent.recipient_wallet).toLowerCase() ||
      String(receipt.x_post_id) !== String(intent.x_post_id) ||
      String(receipt.x_author_id) !== String(intent.x_author_id)
    )
  ) {
    throw new Error(
      'X promotion public proof receipt does not match its immutable payout intent.',
    );
  }

  const network =
    intent.network === 'mainnet' ? 'mainnet' : 'testnet';
  const recipientWallet =
    String(intent.recipient_wallet).toLowerCase();
  const postUrl = safeXUrl(
    submissionResult.data?.submitted_post_url,
    String(intent.x_post_id),
  );
  const txId =
    receipt?.tx_id ? String(receipt.tx_id).toLowerCase() : null;
  const finalized = Boolean(receipt);

  return (
    <main className="proofPage">
      <article className="proofCard">
        <span className="proofBadge">
          {finalized ? 'Verified on-chain' : 'Proof prepared'}
        </span>

        <h1>VeInvite X Promotion Proof</h1>
        <p className="proofDescription">
          {VEINVITE_X_PROMOTION_PROOF_DESCRIPTION}
        </p>

        <dl className="proofFacts">
          <Fact label="Proof ID">{proof.publicProofId}</Fact>
          <Fact label="Proof type">X Promotion</Fact>
          <Fact label="Reward recipient">
            <a
              href={getVeChainExplorerAddressUrl(
                recipientWallet,
                network,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {shorten(recipientWallet)}
            </a>
          </Fact>
          <Fact label="Amount">
            {formatB3tr(intent.amount_wei)} B3TR
          </Fact>
          <Fact label="Source reward cohort">
            #{String(intent.source_reward_cohort_round_id)}
          </Fact>
          <Fact label="X Post">
            {postUrl ? (
              <a target="_blank" rel="noreferrer" href={postUrl}>
                {String(intent.x_post_id)}
              </a>
            ) : (
              String(intent.x_post_id)
            )}
          </Fact>
          <Fact label="Post verified at">
            {formatDate(verification.final_verified_at)}
          </Fact>
          <Fact label="Status">
            {finalized
              ? 'Finalized / paid'
              : 'Verified / awaiting on-chain settlement'}
          </Fact>
          <Fact label="Paid at">{formatDate(receipt?.paid_at)}</Fact>
          {txId ? (
            <Fact label="Reward transaction">
              <a
                href={getVeChainExplorerTransactionUrl(txId, network)}
                target="_blank"
                rel="noreferrer"
              >
                {shorten(txId)}
              </a>
            </Fact>
          ) : null}
        </dl>

        <section className="proofVerification">
          <h2>Verification</h2>
          <p>
            The submitted X Post passed VeInvite&apos;s final promotion
            verification before this payout intent was created. This public
            record does not expose device, IP, location, or internal
            anti-abuse signals.
          </p>
        </section>

        <p className="proofRaw">Structured proof: {proof.proof}</p>
      </article>

      <style jsx>{`
        .proofPage{min-height:100dvh;background:#fffaf0;color:#111;padding:32px 18px}
        .proofCard{width:100%;max-width:680px;margin:0 auto;box-sizing:border-box;background:#fff;border:1px solid #eadfca;border-radius:24px;padding:24px;box-shadow:0 12px 36px rgba(17,17,17,.06)}
        .proofBadge{display:inline-flex;padding:7px 11px;border-radius:999px;background:${finalized ? '#eefbf2' : '#fff5dc'};font-weight:800;font-size:13px}
        h1{margin:18px 0 8px;font-size:30px;line-height:1.15}
        .proofDescription,.proofVerification p{margin:0;color:#625d54;line-height:1.6}
        .proofFacts{display:grid;gap:0;margin:26px 0 0;border-top:1px solid #eee5d7}
        .proofFact{display:grid;grid-template-columns:minmax(135px,.8fr) minmax(0,1.8fr);gap:18px;padding:12px 0;border-bottom:1px solid #f2eadf;font-size:14px}
        .proofFact dt{color:#766f64}.proofFact dd{margin:0;overflow-wrap:anywhere}.proofFact a{color:#8a5900}
        .proofVerification{margin-top:24px}.proofVerification h2{margin:0 0 10px;font-size:19px}
        .proofRaw{margin:24px 0 0;padding-top:18px;border-top:1px solid #eee5d7;color:#766f64;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
        @media(max-width:520px){.proofCard{padding:18px}.proofFact{grid-template-columns:1fr;gap:5px}}
      `}</style>
    </main>
  );
}
