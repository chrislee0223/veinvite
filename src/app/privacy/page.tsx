import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <h1>VeInvite 개인정보처리 안내 / Privacy Notice</h1>
      <p>최종 업데이트: 2026년 8월 28일 / Last updated: August 28, 2026</p>

      <section lang="ko">
        <h2>한국어</h2>
        <p>
          VeInvite는 추천 온보딩 서비스를 운영하고, 보호하고, 검증하고,
          감사하는 데 합리적으로 필요한 정보만 처리합니다.
        </p>

        <h3>VeInvite가 처리할 수 있는 정보</h3>
        <p>
          지갑 주소, 초대 코드, 추천 상태, 인증 및 검증 시각, 온체인 거래와
          블록 참조 정보, 온보딩 진행 상태, 네트워크 정보, 보안 또는 부정
          이용 방지 검토 신호 등이 포함될 수 있습니다.
        </p>

        <h3>VeInvite가 요청하지 않는 정보</h3>
        <p>
          VeInvite는 개인키나 시드 문구를 요청하거나 저장하지 않습니다.
          지갑 서명은 지갑 소유권 확인에만 사용되며, 개인키나 시드 문구를
          공개할 필요가 없습니다.
        </p>

        <h3>공개 블록체인 데이터</h3>
        <p>
          VeChain 거래 데이터는 블록체인 특성상 공개됩니다. VeInvite는
          온보딩 요건 확인, 중복 보상 방지, 부정 이용 조사, 감사 가능한 보상
          기록 유지를 위해 공개 온체인 활동을 조회하고 참조할 수 있습니다.
        </p>

        <h3>인프라 및 서비스 제공자</h3>
        <p>
          VeInvite는 Vercel, Supabase, VeChain 네트워크 엔드포인트 및 지원
          지갑 제공자 등의 인프라를 이용합니다. 서비스 제공에 필요한 경우
          해당 서비스는 각자의 정책에 따라 기술 정보를 처리할 수 있습니다.
        </p>

        <h3>보관</h3>
        <p>
          추천, 검증, 보안 및 보상 기록은 부정 이용 방지, 감사 가능성,
          회계, 분쟁 처리 및 서비스 무결성을 위해 합리적으로 필요한 기간
          동안 보관될 수 있습니다. 공개 블록체인 기록은 VeInvite가 삭제할
          수 없습니다.
        </p>

        <h3>정보 이용</h3>
        <p>
          VeInvite는 개인정보를 판매하지 않습니다. 정보는 서비스 운영 및
          개선, 참여 자격 검증, 보상 시스템 보호, 적용 가능한 생태계 규칙
          준수를 위해 사용됩니다.
        </p>
      </section>

      <hr />

      <section lang="en">
        <h2>English</h2>
        <p>
          VeInvite processes only the information reasonably needed to operate,
          secure, verify, and audit the referral onboarding service.
        </p>

        <h3>Information VeInvite processes</h3>
        <p>
          This may include wallet addresses, invite codes, referral status,
          authentication and verification timestamps, on-chain transaction and
          block references, onboarding progress, network information, and
          security or anti-abuse review signals.
        </p>

        <h3>Information VeInvite does not request</h3>
        <p>
          VeInvite does not request or store private keys or seed phrases. Wallet
          signatures are used only to verify wallet control and should never
          require disclosure of a private key or seed phrase.
        </p>

        <h3>Public blockchain data</h3>
        <p>
          VeChain transaction data is public by design. VeInvite may read and
          reference public on-chain activity to verify onboarding requirements,
          prevent duplicate rewards, investigate abuse, and maintain auditable
          reward records.
        </p>

        <h3>Infrastructure and service providers</h3>
        <p>
          VeInvite relies on infrastructure providers such as Vercel, Supabase,
          VeChain network endpoints, and supported wallet providers. Those
          services may process technical information according to their own
          policies when necessary to provide the service.
        </p>

        <h3>Retention</h3>
        <p>
          Referral, verification, security, and reward records may be retained
          as reasonably necessary for fraud prevention, auditability, accounting,
          dispute handling, and service integrity. Public blockchain records
          cannot be deleted by VeInvite.
        </p>

        <h3>Data use</h3>
        <p>
          VeInvite does not sell personal data. Data is used to operate and
          improve the service, verify eligibility, protect the reward system,
          and comply with applicable ecosystem rules.
        </p>
      </section>

      <Link href="/">VeInvite로 돌아가기 / Back to VeInvite</Link>
    </main>
  );
}
