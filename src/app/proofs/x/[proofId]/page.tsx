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
  robots: {
    index: false,
    follow: false,
  },
};

const B3TR_DECIMALS = 18n;
const B3TR_SCALE = 10n ** B3TR_DECIMALS;

function formatDate(
  raw: unknown,
): string {
  const date =
    new Date(String(raw ?? ''));

  if (Number.isNaN(date.getTime())) {
    return 'Pending';
  }

  return date.toISOString();
}

function shortenHex(
  value: string,
): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatB3tr(
  raw: unknown,
): string {
  const normalized =
    String(raw ?? '');

  if (!/^\d+$/.test(normalized)) {
    return '—';
  }

  const amount =
    BigInt(normalized);
  const whole =
    amount / B3TR_SCALE;
  const remainder =
    amount % B3TR_SCALE;

  if (remainder === 0n) {
    return whole.toString();
  }

  const fraction = remainder
    .toString()
    .padStart(Number(B3TR_DECIMALS), '0')
    .replace(/0+$/u, '');

  return `${whole.toString()}.${fraction}`;
}

function publicXPostUrl(
  value: unknown,
): string | null {
  const raw =
    String(value ?? '').trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      new URL(raw);
    const host =
      parsed.hostname.toLowerCase();

    if (
      parsed.protocol !== 'https:' ||
      ![
        'x.com',
        'www.x.com',
        'twitter.com',
        'www.twitter.com',
      ].includes(host)
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export default async function RewardXPromotionProofPage({
  params,
}: {
  params: Promise<{ proofId: string }>;
}) {
  const {
    proofId: rawProofId,
  } = await params;

  let publicProofId: string;

  try {
    publicProofId =
      normalizeRewardXPromotionPublicProofId(
        rawProofId,
      );
  } catch {
    notFound();
  }

  const proof =
    buildRewardXPromotionProof(
      publicProofId,
    );

  const intentResult =
    await supabaseAdmin
      .from(
        'reward_x_promotion_payout_intents',
      )
      .select(
        'id, verification_id, invite_code, network, recipient_wallet, amount_wei, source_reward_cohort_round_id, x_post_id, x_author_id, public_proof_id, policy_version, created_at',
      )
      .eq(
        'public_proof_id',
        publicProofId,
      )
      .maybeSingle();

  if (intentResult.error) {
    throw new Error(
      `X promotion proof intent could not be loaded: ${intentResult.error.message}`,
    );
  }

  const intent =
    intentResult.data;

  if (
    !intent ||
    String(
      intent.public_proof_id ?? '',
    ).toLowerCase() !==
      publicProofId
  ) {
    notFound();
  }

  const verificationResult =
    await supabaseAdmin
      .from(
        'reward_x_promotion_post_verifications',
      )
      .select(
        'id, submission_id, x_post_id, x_author_id, x_post_created_at, initial_verified_at, final_verified_at, verification_state, invalidated_at',
      )
      .eq(
        'id',
        intent.verification_id,
      )
      .maybeSingle();

  if (verificationResult.error) {
    throw new Error(
      `X promotion proof verification could not be loaded: ${verificationResult.error.message}`,
    );
  }

  const verification =
    verificationResult.data;

  if (
    !verification ||
    verification.verification_state !==
      'FINAL_VERIFIED' ||
    verification.final_verified_at ===
      null ||
    verification.invalidated_at !==
      null ||
    String(
      verification.x_post_id,
    ) !== String(intent.x_post_id) ||
    String(
      verification.x_author_id,
    ) !== String(intent.x_author_id)
  ) {
    notFound();
  }

  const [
    submissionResult,
    receiptResult,
  ] = await Promise.all([
    supabaseAdmin
      .from(
        'reward_x_promotion_post_submissions',
      )
      .select(
        'id, submitted_post_url, submission_state, submitted_at',
      )
      .eq(
        'id',
        verification.submission_id,
      )
      .maybeSingle(),
    supabaseAdmin
      .from(
        'reward_x_promotion_receipts',
      )
      .select(
        'intent_id, tx_id, paid_at, amount_wei, network, public_proof_id, x_post_id, x_author_id',
      )
      .eq(
        'intent_id',
        intent.id,
      )
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

  const receipt =
    receiptResult.data;

  if (
    receipt &&
    (
      String(
        receipt.public_proof_id ?? '',
      ).toLowerCase() !==
        publicProofId ||
      String(
        receipt.amount_wei,
      ) !==
        String(intent.amount_wei) ||
      String(
        receipt.x_post_id,
      ) !==
        String(intent.x_post_id) ||
      String(
        receipt.x_author_id,
      ) !==
        String(intent.x_author_id)
    )
  ) {
    throw new Error(
      'X promotion public proof receipt does not match its immutable payout intent.',
    );
  }

  const network =
    intent.network === 'mainnet'
      ? 'mainnet'
      : 'testnet';
  const recipientWallet =
    String(
      intent.recipient_wallet,
    ).toLowerCase();
  const postUrl =
    publicXPostUrl(
      submissionResult.data
        ?.submitted_post_url,
    );
  const finalized =
    Boolean(receipt);
  const txId =
    receipt?.tx_id
      ? String(
          receipt.tx_id,
        ).toLowerCase()
      : null;

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
          border:
            '1px solid #eadfca',
          borderRadius: 24,
          padding: 24,
          boxShadow:
            '0 12px 36px rgba(17,17,17,0.06)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '7px 11px',
            borderRadius: 999,
            background: finalized
              ? '#eefbf2'
              : '#fff5dc',
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
          {VEINVITE_X_PROMOTION_PROOF_DESCRIPTION}
        </p>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(135px, 0.8fr) minmax(0, 1.8fr)',
            gap: '14px 18px',
            margin: '26px 0 0',
            paddingTop: 22,
            borderTop:
              '1px solid #eee5d7',
            fontSize: 14,
          }}
        >
          <dt style={{ color: '#766f64' }}>
            Proof ID
          </dt>
          <dd
            style={{
              margin: 0,
              overflowWrap:
                'anywhere',
            }}
          >
            {proof.publicProofId}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Proof type
          </dt>
          <dd style={{ margin: 0 }}>
            X Promotion
          </dd>

          <dt style={{ color: '#766f64' }}>
            Reward recipient
          </dt>
          <dd
            style={{
              margin: 0,
              overflowWrap:
                'anywhere',
            }}
          >
            <a
              href={getVeChainExplorerAddressUrl(
                recipientWallet,
                network,
              )}
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#8a5900',
              }}
            >
              {shortenHex(
                recipientWallet,
              )}
            </a>
          </dd>

          <dt style={{ color: '#766f64' }}>
            Amount
          </dt>
          <dd style={{ margin: 0 }}>
            {formatB3tr(
              intent.amount_wei,
            )}{' '}
            B3TR
          </dd>

          <dt style={{ color: '#766f64' }}>
            Source reward cohort
          </dt>
          <dd style={{ margin: 0 }}>
            #
            {String(
              intent.source_reward_cohort_round_id,
            )}
          </dd>

          <dt style={{ color: '#766f64' }}>
            X Post
          </dt>
          <dd
            style={{
              margin: 0,
              overflowWrap:
                'anywhere',
            }}
          >
            {postUrl ? (
              <a
                href={postUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color:
                    '#8a5900',
                }}
              >
                {String(
                  intent.x_post_id,
                )}
              </a>
            ) : (
              String(
                intent.x_post_id,
              )
            )}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Post verified at
          </dt>
          <dd style={{ margin: 0 }}>
            {formatDate(
              verification.final_verified_at,
            )}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Status
          </dt>
          <dd style={{ margin: 0 }}>
            {finalized
              ? 'Finalized / paid'
              : 'Verified / awaiting on-chain settlement'}
          </dd>

          <dt style={{ color: '#766f64' }}>
            Paid at
          </dt>
          <dd style={{ margin: 0 }}>
            {formatDate(
              receipt?.paid_at,
            )}
          </dd>

          {txId ? (
            <>
              <dt style={{ color: '#766f64' }}>
                Reward transaction
              </dt>
              <dd
                style={{
                  margin: 0,
                  overflowWrap:
                    'anywhere',
                }}
              >
                <a
                  href={getVeChainExplorerTransactionUrl(
                    txId,
                    network,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color:
                      '#8a5900',
                  }}
                >
                  {shortenHex(
                    txId,
                  )}
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        <section
          style={{
            marginTop: 26,
            paddingTop: 22,
            borderTop:
              '1px solid #eee5d7',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: 19,
            }}
          >
            Verification
          </h2>
          <p
            style={{
              margin: 0,
              color: '#625d54',
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            The submitted X Post passed VeInvite's
            final promotion verification before this
            payout intent was created. This public
            record does not expose device, IP,
            location, or internal anti-abuse signals.
          </p>
        </section>

        <p
          style={{
            margin: '24px 0 0',
            paddingTop: 18,
            borderTop:
              '1px solid #eee5d7',
            color: '#766f64',
            fontSize: 12,
            lineHeight: 1.6,
            overflowWrap: 'anywhere',
          }}
        >
          Structured proof: {proof.proof}
        </p>
      </section>
    </main>
  );
}
