import Link from 'next/link';

export default function TermsPage() {
  return <main className="legalPage"><h1>VeInvite 이용약관 초안</h1><p>VeInvite의 추천 보상은 고정 금액이 아니며 주간 참여 결과, 검증 결과, DAO 정책과 가용 재원에 따라 달라질 수 있습니다.</p><h2>참여 제한</h2><p>기존 VeBetterDAO 이용자, 중복 추천, 자기 추천, 부정 활동 또는 검증에 실패한 참여는 추천 보상 대상에서 제외됩니다.</p><h2>초대 취소</h2><p>초대를 취소하면 초대 가능 인원은 복구되지만 해당 초대의 추천 보상 자격은 영구적으로 소멸합니다.</p><Link href="/">홈으로</Link></main>;
}
