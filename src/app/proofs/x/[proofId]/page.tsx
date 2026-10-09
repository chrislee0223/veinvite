import type {
  CSSProperties,
  ReactNode,
} from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildRewardXPromotionProof,
  normalizeRewardXPromotionPublicProofId,
  VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
} from '@/lib/rewards/rewardXPromotionProof';
import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
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

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  background: '#fffaf0',
  color: '#111111',
  padding: '32px 18px',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 680,
  margin: '0 auto',
  boxSizing: 'border-box',
  background: '#ffffff',
  border: '1px solid #eadfca',
  borderRadius: 24,
  padding: 24,
  boxShadow: '0 12px 36px rgba(17,17,17,0.06)',
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  color: '#625d54',
  lineHeight: 1.6,
};

const factListStyle: CSSProperties = {
  display: 'grid',
  gap: 0,
  margin: '26px 0 0',
  borderTop: '1px solid #eee5d7',
};

const factStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'minmax(135px, 0.8fr) minmax(0, 1.8fr)',
  gap: 18,
  padding: '12px 0',
  borderBottom: '1px solid #f2eadf',
  fontSize: 14,
};

const labelStyle: CSSProperties = {
  color: '#766f64',
};

const valueStyle: CSSProperties = {
  margin: 0,
  overflowWrap: 'anywhere',
};

const linkStyle: CSSProperties = {
  color: '#8a5900',
};

function formatDate(raw: unknown): string {
  const date =
    new Date(String(raw ?? ''));

  return Number.isNaN(date.getTime())
    ? 'Pending'
    : date.toISOString();
}

function shorten(value: string): string {
  return value.length <= 18
    ? value
    : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function safeXUrl(
  raw: unknown,
  expectedPostId: string,
): string | null {
  try {
    const url =
      new URL(String(raw ?? ''));
    const allowedHosts =
      new Set([
        'x.com',
        'www.x.com',
        'twitter.com',
        'www.twitter.com',
      ]);

    return (
      url.protocol === 'https:' &&
      allowedHosts.has(
        url.hostname.toLowerCase(),
      ) &&
      url.pathname
        .split('/')
        .includes(expectedPostId)
    )
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
  children: ReactNode;
}) {
  return (
    <div style={factStyle}>
      <dt style={labelStyle}>
        {label}
      </dt>
      <dd style={valueStyle}>
        {children}
      </dd>
    </div>
  );
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
        'id, verification_id, network, recipient_wallet, amount_wei, source_reward_cohort_round_id, x_post_id, x_author_id, public_proof_id',
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
        'submission_id, x_post_id, x_author_id, final_verified_at, verification_state, invalidated_at',
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
    ) !==
      String(intent.x_post_id) ||
    String(
      verification.x_author_id,
    ) !==
      String(intent.x_author_id)
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
        'submitted_post_url',
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
        'tx_id, paid_at, amount_wei, network, recipient_wallet, public_proof_id, x_post_id, x_author_id',
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
        receipt.network,
      ) !==
        String(intent.network) ||
      String(
        receipt.recipient_wallet,
      ).toLowerCase() !==
        String(
          intent.recipient_wallet,
        ).toLowerCase() ||
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
    safeXUrl(
      submissionResult.data
        ?.submitted_post_url,
      String(
        intent.x_post_id,
      ),
    );
  const txId =
    receipt?.tx_id
      ? String(
          receipt.tx_id,
        ).toLowerCase()
      : null;
  const finalized =
    Boolean(receipt);

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    padding: '7px 11px',
    borderRadius: 999,
    background:
      finalized
        ? '#eefbf2'
        : '#fff5dc',
    fontWeight: 800,
    fontSize: 13,
  };

  return (
    <main style={pageStyle}>
      <article style={cardStyle}>
        <span style={badgeStyle}>
          {finalized
            ? 'Verified on-chain'
            : 'Proof prepared'}
        </span>

        <h1
          style={{
            margin: '18px 0 8px',
            fontSize: 30,
            lineHeight: 1.15,
          }}
        >
          VeInvite X Promotion Proof
        </h1>

        <p style={descriptionStyle}>
          {VEINVITE_X_PROMOTION_PROOF_DESCRIPTION}
        </p>

        <dl style={factListStyle}>
          <Fact label="Proof ID">
            {proof.publicProofId}
          </Fact>
          <Fact label="Proof type">
            X Promotion
          </Fact>
          <Fact label="Reward recipient">
            <a
              href={getVeChainExplorerAddressUrl(
                recipientWallet,
                network,
              )}
              target="_blank"
              rel="noreferrer"
              style={linkStyle}
            >
              {shorten(
                recipientWallet,
              )}
            </a>
          </Fact>
          <Fact label="Amount">
            {formatWeiAsB3tr(
              String(
                intent.amount_wei,
              ),
              18,
            )}{' '}
            B3TR
          </Fact>
          <Fact label="Source reward cohort">
            #
            {String(
              intent.source_reward_cohort_round_id,
            )}
          </Fact>
          <Fact label="X Post">
            {postUrl ? (
              <a
                target="_blank"
                rel="noreferrer"
                href={postUrl}
                style={linkStyle}
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
          </Fact>
          <Fact label="Post verified at">
            {formatDate(
              verification.final_verified_at,
            )}
          </Fact>
          <Fact label="Status">
            {finalized
              ? 'Finalized / paid'
              : 'Verified / awaiting on-chain settlement'}
          </Fact>
          <Fact label="Paid at">
            {formatDate(
              receipt?.paid_at,
            )}
          </Fact>

          {txId ? (
            <Fact label="Reward transaction">
              <a
                href={getVeChainExplorerTransactionUrl(
                  txId,
                  network,
                )}
                target="_blank"
                rel="noreferrer"
                style={linkStyle}
              >
                {shorten(
                  txId,
                )}
              </a>
            </Fact>
          ) : null}
        </dl>

        <section
          style={{
            marginTop: 24,
          }}
        >
          <h2
            style={{
              margin:
                '0 0 10px',
              fontSize: 19,
            }}
          >
            Verification
          </h2>
          <p style={descriptionStyle}>
            The submitted X Post passed
            VeInvite&apos;s final promotion
            verification before this payout
            intent was created. This public
            record does not expose device, IP,
            location, or internal anti-abuse
            signals.
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
            overflowWrap:
              'anywhere',
          }}
        >
          Structured proof: {proof.proof}
        </p>
      </article>
    </main>
  );
}
