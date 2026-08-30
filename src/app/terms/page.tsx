import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="legalPage">
      <h1>VeInvite 이용약관 / Terms of Use</h1>
      <p>최종 업데이트: 2026년 8월 30일 / Last updated: August 30, 2026</p>

      <section lang="ko">
        <h2>한국어</h2>
        <p>
          VeInvite는 VeBetterDAO 생태계를 위한 추천 기반 신규 사용자 온보딩
          및 복귀 사용자 재활성화 서비스입니다. VeInvite를 이용하면 본 약관과
          적용 가능한 VeBetterDAO 규칙, 그리고 이용하는 제3자 앱 또는 지갑의
          약관을 준수하는 데 동의하는 것으로 간주됩니다.
        </p>

        <h3>추천 참여 자격</h3>
        <p>
          추천 참여 자격은 지갑 소유권, 진입 전 활동 이력, 필수 온보딩 활동,
          거버넌스 참여, 중복 방지 및 부정 이용 검토를 포함한 VeInvite의 검증
          규칙에 따라 결정됩니다. 이전에 보상 또는 Allocation Voting 활동이
          확인되지 않는 지갑은 신규 사용자로 인정될 수 있습니다. 과거 활동은
          있으나 최근 12개 완료 라운드 시작 시점부터 자격 확인 시점까지 보상
          또는 Allocation Voting 활동이 없는 지갑은 복귀 사용자로 인정될 수
          있습니다. 최근 활동이 있는 기존 사용자, 자기 초대, 중복 추천,
          조작된 활동 또는 검증할 수 없는 추천은 거절되거나 보상에서 제외될
          수 있습니다.
        </p>

        <h3>추천 보상의 대상</h3>
        <p>
          초대받은 사용자의 dApp 활동, B3TR에서 VOT3로의 전환 및 Allocation
          Voting은 온보딩 검증 기준입니다. VeInvite는 이러한 행동을 이유로
          피추천자에게 동일 행동에 대한 별도의 B3TR 보상을 추가 지급하지
          않습니다. 추천 보상 재원이 활성화된 경우, 자격을 갖춘 신규 또는
          복귀 사용자를 실제 온보딩 완료까지 연결한 초대자가 최종 검증 후
          추천 보상 대상이 될 수 있습니다.
        </p>

        <h3>보상은 보장되지 않습니다</h3>
        <p>
          B3TR 추천 보상은 고정되거나 보장되지 않습니다. 초대자의 지급 자격,
          지급 시점, 보상 금액은 온보딩 검증 결과, 최종 Sybil 검토, VeInvite
          추천 보상 풀의 가용 자금과 이월분, VeBetterDAO 배분 결과 및 현재
          생태계 규칙에 따라 달라질 수 있습니다. 보안, 기술적 안정성 또는 규칙
          준수를 위해 보상 배분이 일시 중단되거나 변경될 수 있습니다.
        </p>

        <h3>초대 취소</h3>
        <p>
          초대자는 피추천자가 초대를 수락하기 전까지만 초대를 취소할 수
          있습니다. 피추천자가 초대를 수락한 이후에는 피추천자의 온보딩 진행
          상태와 감사 기록을 보호하기 위해 초대를 취소할 수 없습니다.
        </p>

        <h3>지갑 보안</h3>
        <p>
          VeInvite는 비수탁형 서비스입니다. VeInvite는 개인키나 시드 문구를
          요청하거나 저장하지 않습니다. VeInvite, 커뮤니티 구성원 또는 지원을
          제공한다고 주장하는 누구에게도 개인키나 시드 문구를 공유하지 마세요.
        </p>

        <h3>서비스 이용 가능성</h3>
        <p>
          블록체인 노드, 지갑, VeBetterDAO 계약 및 제3자 앱에는 지연이나
          장애가 발생할 수 있습니다. VeInvite는 안전하게 검증을 완료할 수
          없는 경우 일부 기능을 일시적으로 제한할 수 있으며, 서비스와 생태계
          규칙의 변화에 따라 본 약관을 업데이트할 수 있습니다.
        </p>
      </section>

      <hr />

      <section lang="en">
        <h2>English</h2>
        <p>
          VeInvite is a referral-based onboarding and reactivation service for
          the VeBetterDAO ecosystem. By using VeInvite, you agree to these terms
          and to comply with applicable VeBetterDAO rules and the terms of any
          third-party apps or wallets you use.
        </p>

        <h3>Referral eligibility</h3>
        <p>
          Referral eligibility is determined through VeInvite&apos;s verification
          rules, including wallet ownership, entry-history checks, required
          onboarding activity, governance participation, duplicate prevention,
          and anti-abuse review. A wallet may qualify as new when no prior
          rewarded or allocation-voting VeBetterDAO activity is found. A wallet
          with older activity may qualify as returning when no rewarded or
          allocation-voting activity is found from the start of the previous 12
          completed VeBetterDAO rounds through the eligibility check. Existing
          users with recent activity, self-referrals, duplicate referrals,
          manipulated activity, or referrals that cannot be verified may be
          rejected or excluded from rewards.
        </p>

        <h3>Who a referral reward is for</h3>
        <p>
          The invitee&apos;s dApp activity, B3TR-to-VOT3 conversion, and Allocation
          Voting are onboarding-verification criteria. VeInvite does not pay the
          invitee additional B3TR merely for those same actions. When funded
          referral rewards are enabled, the inviter who successfully brings an
          eligible new or returning user through verified onboarding may qualify
          for a referral reward after final verification.
        </p>

        <h3>Rewards are not guaranteed</h3>
        <p>
          B3TR referral rewards are not fixed or guaranteed. Inviter eligibility,
          timing, and amounts may depend on onboarding evidence, final Sybil
          review, available VeInvite referral-reward pool funds and carry-over,
          VeBetterDAO allocation outcomes, and current ecosystem rules. Reward
          distribution may be paused or changed when needed for security,
          technical reliability, or rule compliance.
        </p>

        <h3>Invite cancellation</h3>
        <p>
          An inviter may cancel an invite only before it has been accepted by an
          invitee. Once an invite has been accepted, it cannot be cancelled in
          order to protect the invitee&apos;s onboarding progress and audit history.
        </p>

        <h3>Wallet safety</h3>
        <p>
          VeInvite is non-custodial. VeInvite does not request or store private
          keys or seed phrases. Never share a private key or seed phrase with
          VeInvite, a community member, or anyone claiming to provide support.
        </p>

        <h3>Service availability</h3>
        <p>
          Blockchain nodes, wallets, VeBetterDAO contracts, and third-party apps
          may experience delays or outages. VeInvite may temporarily restrict
          actions when verification cannot be completed safely and may update
          these terms as the service and ecosystem rules evolve.
        </p>
      </section>

      <Link href="/">VeInvite로 돌아가기 / Back to VeInvite</Link>
    </main>
  );
}
