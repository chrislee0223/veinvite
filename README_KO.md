# VeInvite

VeInvite는 VeBetterDAO 신규 사용자 온보딩과 휴면 사용자 복귀를 검증형 추천 흐름으로 연결하는 dApp입니다.

## 현재 상태

현재 저장소는 단순 테스트넷 데모가 아니라 Production 운영을 전제로 한 구조를 포함합니다.

- Production: VeChain Mainnet + Supabase + Vercel
- VeChain Kit / VeWorld 지갑 연결 및 서버 측 지갑 소유권 검증
- 추천인당 동시 활성 초대 1개 제한
- 자기 추천 및 동일 invitee의 중복 추천 차단
- 초대 수락 시 온체인 이력으로 신규 / 복귀 / 기존 사용자 분류
- 복귀 사용자는 최근 12개 완료 VeBetterDAO 라운드와 현재 확인 블록까지 활동 여부 검증
- 초대 이후 서로 다른 VeBetterDAO dApp 3개의 **양수 B3TR 보상** 검증
- 최소 1 B3TR의 직접 B3TR → VOT3 전환 검증
- VOT3 전환 이후 Allocation Voting 검증
- 온체인 impact evidence와 블록/트랜잭션/clause 실행순서 저장
- Sybil 검토 상태와 보상 자격을 DB 제약·트리거로 연동
- 보상 자격 완료 시 초대자 지갑을 자동 referral reward queue에 등록
- VeBetterDAO 실제 라운드 및 `AllocationRewardsClaimed` 증거와 보상 라운드 연결
- immutable payout manifest, 운영자 VeWorld 승인, tx 등록, finalized 검증 후 PAID 처리
- VeBetterDAO Team Allocation 20% / VeInvite 추천 보상 풀 80% 설정 지원
- 라운드별 신규·복귀·기존 활성·성공 추천·실지급·allocation·이월 통계 집계

## 중요한 운영 원칙

VeInvite의 `신규 사용자` 판정은 **확인 가능한 VeBetterDAO 보상 및 Allocation Voting 이력이 없는 지갑**을 뜻합니다. 한 지갑이 반드시 한 명의 실제 사람이라는 의미까지 증명하지는 않습니다.

`복귀 사용자`는 과거 qualifying 이력이 있지만 최근 12개 완료 라운드 및 초대 확인 시점까지 qualifying 활동이 감지되지 않은 지갑입니다. 신규 사용자와 복귀 사용자는 별도로 분류·보고합니다.

피추천자의 dApp 보상, B3TR → VOT3 전환, Allocation Voting은 **온보딩 검증 기준**입니다. VeInvite가 피추천자에게 같은 행동으로 추가 B3TR을 지급하는 구조가 아닙니다. funded referral rewards가 활성화되면 자격을 갖춘 신규 또는 복귀 사용자를 실제 온보딩 완료까지 연결한 **초대자**가 최종 검증 후 추천 보상 대상이 됩니다.

추천 보상은 실제 온체인 미션 증거, 정상 entry eligibility, Sybil CLEAR 상태가 모두 충족되어야 지급 큐에 들어갈 수 있습니다. 증거가 불완전하거나 검증에 실패하면 fail-closed 방식으로 지급되지 않습니다.

**Mainnet funded referral rewards는 현재 활성화되어 있지 않습니다.** 활성화 이후에도 서버가 운영 지갑 개인키를 보관해 자동 송금하지 않습니다. immutable payout manifest를 기준으로 운영자가 VeWorld에서 직접 승인하고, 제출된 tx가 finalized 체인 검증을 통과한 뒤에만 PAID 정산됩니다.

## 미션 흐름

1. 초대 링크를 통해 VeInvite 참여
2. 서로 다른 VeBetterDAO dApp 3개에서 실제 양수 B3TR 보상 완료
3. 첫 인정 dApp 보상 이후 최소 1 B3TR을 VOT3로 직접 전환
4. 전환 이후 VeBetterDAO Allocation Voting 참여
5. 온체인 증거 및 Sybil 검토 통과
6. 온보딩 성공 확인 및 초대자 추천 보상 자격 큐 등록

첫 dApp 보상 이후에는 VOT3 전환과 투표를 먼저 진행하고 나머지 dApp 미션을 나중에 완료해도 됩니다. 다만 실제 실행순서는 `첫 qualifying dApp 보상 → VOT3 전환 → Allocation Voting`이 증명되어야 합니다.

## 개발 실행

1. Node.js 20 이상을 준비합니다.
2. 환경변수를 안전한 로컬/Preview 프로젝트에 설정합니다.
3. 의존성을 설치하고 실행합니다.

```bash
npm install
npm run dev
```

Preview 및 로컬 환경은 Production Supabase에 접근하지 못하도록 서버 가드가 적용되어 있습니다.

## 현재 남은 운영 게이트

- public reporting 시작 기준일을 실제 출시 시점에 명시적으로 설정
- Mainnet funded referral rewards 활성화 전 VeBetterDAO 정책/RuleBook 해석 최종 확인
- 첫 실제 allocation 수령 후 `allocation → reward round → manifest → VeWorld 승인 → finalized 검증 → PAID` 실운영 1회 확인
- 실제 운영 데이터가 쌓인 뒤 Sybil 신호와 운영 리포트 품질 재평가

UI/UX 구조 변경은 별도 검토 단계에서 진행하며, 현재 백엔드 안전성 작업과 분리합니다.
