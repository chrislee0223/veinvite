import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="legalPage">
      <h1>VeInvite Terms of Use</h1>
      <p>Last updated: August 24, 2026</p>

      <p>
        VeInvite is a referral-based onboarding and reactivation service for
        the VeBetterDAO ecosystem. By using VeInvite, you agree to these terms
        and to comply with applicable VeBetterDAO rules and the terms of any
        third-party apps or wallets you use.
      </p>

      <h2>Referral eligibility</h2>
      <p>
        Referral eligibility is determined through VeInvite&apos;s verification
        rules, including wallet ownership, entry-history checks, required
        onboarding activity, governance participation, duplicate prevention,
        and anti-abuse review. A wallet may qualify as new when no prior
        rewarded or allocation-voting VeBetter activity is found. A wallet
        with older activity may qualify as returning when no rewarded or
        allocation-voting activity is found from the start of the previous 12
        completed VeBetter rounds through the eligibility check. Recently
        active existing users, self-referrals, duplicate referrals,
        manipulated activity, or referrals that cannot be verified may be
        rejected or excluded from rewards.
      </p>

      <h2>Rewards are not guaranteed</h2>
      <p>
        B3TR referral rewards are not fixed or guaranteed. Eligibility,
        timing, and amounts may depend on verification results, available
        VeInvite reward-pool funds, VeBetterDAO allocation outcomes, and
        current ecosystem rules. Reward distribution may be paused or changed
        when needed for security, technical reliability, or rule compliance.
      </p>

      <h2>Invite cancellation</h2>
      <p>
        An inviter may cancel an invite only before it has been accepted by an
        invitee. Once an invite has been accepted, it cannot be cancelled in
        order to protect the invitee&apos;s onboarding progress and audit history.
      </p>

      <h2>Wallet safety</h2>
      <p>
        VeInvite is non-custodial. VeInvite does not request or store private
        keys or seed phrases. Never share a private key or seed phrase with
        VeInvite, a community member, or anyone claiming to provide support.
      </p>

      <h2>Service availability</h2>
      <p>
        Blockchain nodes, wallets, VeBetterDAO contracts, and third-party apps
        may experience delays or outages. VeInvite may temporarily restrict
        actions when verification cannot be completed safely and may update
        these terms as the service and ecosystem rules evolve.
      </p>

      <Link href="/">Back to VeInvite</Link>
    </main>
  );
}
