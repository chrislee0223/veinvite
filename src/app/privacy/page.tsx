import Link from 'next/link';

export default function PrivacyPage() {
  return <main className="legalPage"><h1>VeInvite 개인정보처리방침 초안</h1><p>VeInvite는 서비스 제공에 필요한 최소 정보만 처리합니다. 지갑 주소, 초대 코드, 활성화 검증 상태, 보안 위험 신호가 포함될 수 있습니다.</p><h2>수집하지 않는 정보</h2><p>개인키와 시드 문구를 요구하거나 저장하지 않습니다.</p><h2>보유 및 삭제</h2><p>최종 보유 기간은 실제 데이터베이스와 법률 검토 후 확정해야 합니다. 본 문서는 테스트넷 MVP용 초안입니다.</p><Link href="/">홈으로</Link></main>;
}
