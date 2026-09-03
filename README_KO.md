# VeInvite

VeInvite는 VeBetterDAO 신규 사용자 온보딩과 휴면 사용자 복귀를 검증형 추천 흐름으로 연결하는 dApp입니다.

## 현재 상태

현재 저장소는 VeChain Mainnet에서 운영 중인 Production 구조와 자동 보상 파이프라인을 포함합니다.

- Production: VeChain Mainnet + Supabase + Vercel
- VeChain Kit / VeWorld 지갑 연결 및 서버 측 지갑 소유권 검증
- 추천인별 **영구 초대 링크 1개 + 재사용 가능한 친구 슬롯 2개** 구조
- 자격을 충족한 친구는 동시에 최대 2명까지 온보딩 진행 가능
- 영구 링크를 단순히 열기만 해서는 초대 레코드나 슬롯을 소비하지 않고, 지갑 인증과 참여 자격 확인을 통과한 뒤에만 슬롯 배정
- 기존에 배포된 일회용 `/i/<code>` 초대 링크도 계속 지원
- 자기 추천, 동일 invitee 중복 추천, 추천 관계 순환 차단
- 초대 수락 시 온체인 이력으로 신규 / 복귀 / 활성 기존 사용자 분류
- 복귀 사용자는 최근 12개 완료 VeBetterDAO 라운드와 현재 확인 블록까지 활동 여부 검증
- 초대 이후 서로 다른 VeBetterDAO dApp 3개의 **양수 B3TR 보상** 검증
- 첫 qualifying dApp 보상 이후 최소 1 B3TR의 직접 B3TR → VOT3 전환 검증
- qualifying VOT3 전환 이후 Allocation Voting 검증
- 온체인 impact evidence와 블록/트랜잭션/clause 실행순서 저장
- Sybil 검토 상태와 보상 자격을 DB 제약·트리거로 연동
- Sybil `BLOCKED` 관계는 감사 기록은 유지하면서 동시 진행 슬롯은 다시 사용할 수 있도록 분리
- 보상 자격 완료 시 초대자 지갑을 자동 referral reward queue에 등록
- VeBetterDAO 실제 라운드 및 `AllocationRewardsClaimed` 증거와 보상 라운드 연결
- immutable payout manifest, 전용 Reward Distributor, 서명 트랜잭션 저널, finalized 체인 검증 후에만 PAID 처리
- VeBetterDAO Team Allocation 20% / VeInvite 추천 보상 풀 80% 설정 지원
- 라운드별 신규·복귀·활성 기존·성공 추천·실지급·allocation·이월 통계 집계
- 27개 언어, RTL/스크립트별 레이아웃 보호, 지갑별 언어 설정 복원

## 중요한 운영 원칙

VeInvite의 `신규 사용자` 판정은 **확인 가능한 VeBetterDAO 보상 및 Allocation Voting 이력이 없는 지갑**을 뜻합니다. 한 지갑이 반드시 한 명의 실제 사람이라는 의미까지 증명하지는 않습니다.

`복귀 사용자`는 과거 qualifying 이력이 있지만 최근 12개 완료 라운드 및 초대 확인 시점까지 qualifying 활동이 감지되지 않은 지갑입니다. 신규 사용자와 복귀 사용자는 별도로 분류·보고합니다.

피추천자의 dApp 보상, B3TR → VOT3 전환, Allocation Voting은 **온보딩 검증 기준**입니다. VeInvite가 피추천자에게 같은 행동으로 추가 B3TR을 지급하는 구조가 아닙니다. 최종 검증을 통과한 신규 또는 복귀 사용자를 온보딩 완료까지 연결한 **초대자**가 추천 보상 대상입니다.

추천 보상은 실제 온체인 미션 증거, 정상 entry eligibility, 최신 Sybil/VePassport 신호 검토, 보상 풀 및 런타임 안전조건이 모두 충족되어야 자동 지급 단계로 진행할 수 있습니다. 증거가 불완전하거나 검증에 실패하면 fail-closed 방식으로 지급되지 않습니다.

영구 링크 자체는 참여 슬롯이 아닙니다. 자격 미달 사용자, 자기 추천, 이미 다른 추천 관계에 연결된 지갑, 추천 관계 순환 시도, 두 슬롯이 모두 사용 중인 상황은 새 invitation을 만들지 않습니다. 따라서 링크 방문 수와 실제 온보딩 시작 수는 서로 다른 지표로 관리합니다.

## 자동 보상 구조

Mainnet 자동 추천 보상 파이프라인은 현재 코드와 Production 설정에서 활성화되어 있습니다. 다만 아직 모든 Production 자격조건을 완료한 추천이 없어 첫 실제 자동 B3TR 지급은 발생하지 않았습니다. 테스트를 위해 가짜 추천을 만들거나 조건을 낮추지 않습니다.

자동 지급은 단순히 DB의 `PENDING` 또는 `COMPLETED` 상태만 보고 송금하지 않습니다.

1. immutable entry/mission evidence와 Sybil 조건을 다시 검증합니다.
2. eligible referral을 보상 큐에 고정합니다.
3. 실제 VeBetterDAO allocation receipt와 funded reward budget을 확인합니다.
4. immutable payout manifest와 체인 checkpoint를 생성합니다.
5. 앱 관리자 지갑과 분리된 전용 Reward Distributor만 서명에 사용합니다.
6. signed transaction과 제출 상태를 저널링해 중복 송금을 방지합니다.
7. VeChain finalized 상태와 실제 `RewardDistributed` 이벤트가 manifest와 정확히 일치하는지 검증합니다.
8. 검증이 끝난 뒤에만 payout/receipt를 `PAID`로 확정합니다.

보상은 초대자 지갑당 한 번이 아니라 **검증 완료된 invitation별**로 처리됩니다. 따라서 한 초대자가 두 친구를 모두 정상 온보딩 완료시키면 두 invitation은 각각 독립적으로 보상 자격을 검증합니다.

자동 보상은 별도의 서버 런타임 게이트, distributor 주소 일치, on-chain 등록, emergency pause, DB lease 및 재시도 안전장치를 모두 통과해야 합니다. 일상적인 UI 변경이나 단순 배포만으로 지급 조건을 우회할 수 없습니다.

## 미션 흐름

1. 초대자의 영구 초대 링크를 통해 VeInvite 진입
2. 지갑 인증 및 신규/복귀 참여 자격 확인 후 비어 있는 친구 슬롯 배정
3. 서로 다른 VeBetterDAO dApp 3개에서 실제 양수 B3TR 보상 완료
4. 첫 인정 dApp 보상 이후 최소 1 B3TR을 VOT3로 직접 전환
5. 전환 이후 VeBetterDAO Allocation Voting 참여
6. 온체인 증거 및 Sybil 검토 통과
7. 온보딩 성공 확인 및 초대자 추천 보상 자격 큐 등록
8. funded reward budget이 준비되면 자동 지급 파이프라인이 최종 검증 후 처리

첫 dApp 보상 이후에는 VOT3 전환과 투표를 먼저 진행하고 나머지 dApp 미션을 나중에 완료해도 됩니다. 다만 실제 실행순서는 `첫 qualifying dApp 보상 → VOT3 전환 → Allocation Voting`이 증명되어야 합니다.

## 개발 실행

1. Node.js 20 이상을 준비합니다.
2. 환경변수를 안전한 로컬/Preview 프로젝트에 설정합니다.
3. 의존성을 설치하고 실행합니다.

```bash
npm install
npm run dev
```

Preview 및 로컬 환경은 Production Supabase에 접근하지 못하도록 서버 가드가 적용되어 있습니다. Production 번들은 demo UI를 강제로 비활성화하고, demo 완료 API도 Preview/로컬에서만 별도로 허용됩니다.

## 현재 남은 운영 과제

- 첫 실제 eligible referral이 생겼을 때 `allocation → reward round → manifest → automatic submission → finalized verification → receipt` 전체 실지급 E2E 확인
- 영구 링크 + 2개 동시 슬롯 전환 후 실제 완료율 변화를 보면서 예상 완료자 수와 보상 예측 stress denominator 재평가
- 현재 일 1회인 독립 recovery cron보다 높은 빈도의 복구 worker가 필요해지는지 운영 데이터로 판단
- 보상 규모가 커질 경우 전용 Reward Distributor의 signing secret을 managed signer/HSM 계열로 이전 검토
- B3TR wallet-to-wallet 집결 패턴을 분석할 별도 Transfer-event 인덱서/상관관계 리포트 검토
- 실제 운영 데이터가 더 쌓인 뒤 Sybil 신호·리포트 임계값 재평가
- 모바일 실브라우저 E2E/접근성/시각 회귀 테스트 자동화 확대

세부 현재 제한사항은 `docs/KNOWN_LIMITATIONS.md`를 기준 문서로 사용합니다.
