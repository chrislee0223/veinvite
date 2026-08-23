import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <h1>VeInvite Privacy Notice</h1>
      <p>Last updated: August 23, 2026</p>

      <p>
        VeInvite processes only the information reasonably needed to operate,
        secure, verify, and audit the referral onboarding service.
      </p>

      <h2>Information VeInvite processes</h2>
      <p>
        This may include wallet addresses, invite codes, referral status,
        authentication and verification timestamps, on-chain transaction and
        block references, onboarding progress, network information, and
        security or anti-abuse review signals.
      </p>

      <h2>Information VeInvite does not request</h2>
      <p>
        VeInvite does not request or store private keys or seed phrases. Wallet
        signatures are used only to verify wallet control and should never
        require disclosure of a private key or seed phrase.
      </p>

      <h2>Public blockchain data</h2>
      <p>
        VeChain transaction data is public by design. VeInvite may read and
        reference public on-chain activity to verify onboarding requirements,
        prevent duplicate rewards, investigate abuse, and maintain auditable
        reward records.
      </p>

      <h2>Infrastructure and service providers</h2>
      <p>
        VeInvite relies on infrastructure providers such as Vercel, Supabase,
        VeChain network endpoints, and supported wallet providers. Those
        services may process technical information according to their own
        policies when necessary to provide the service.
      </p>

      <h2>Retention</h2>
      <p>
        Referral, verification, security, and reward records may be retained
        as reasonably necessary for fraud prevention, auditability, accounting,
        dispute handling, and service integrity. Public blockchain records
        cannot be deleted by VeInvite.
      </p>

      <h2>Data use</h2>
      <p>
        VeInvite does not sell personal data. Data is used to operate and
        improve the service, verify eligibility, protect the reward system,
        and comply with applicable ecosystem rules.
      </p>

      <Link href="/">Back to VeInvite</Link>
    </main>
  );
}
