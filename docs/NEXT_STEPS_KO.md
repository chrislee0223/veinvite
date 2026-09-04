# 다음 단계 — Production 운영 상태

업데이트: 2026-09-04

이 문서는 과거의 초기 구축·수동 지급 체크리스트를 대체합니다. 현재 VeInvite는 Production 온보딩과 전용 Reward Distributor 기반 자동 추천 보상 파이프라인을 포함합니다. 자동 지급이 활성화되어 있다는 것은 모든 완료 건에 즉시 보상이 보장된다는 뜻이 아닙니다. 실제 allocation, 추천 보상 풀, 완전한 자격 증빙, Sybil CLEAR, 라운드 준비 및 finalized 체인 검증을 모두 통과해야 지급됩니다.

## 1. 현재 완료된 핵심 영역

- [x] Next.js / Vercel Production 배포 구조
- [x] Production / Preview Supabase 프로젝트 분리 및 교차 접근 fail-closed 가드
- [x] VeWorld 지갑 연결 및 지갑 서명 기반 세션 인증
- [x] 한 지갑당 최대 5개의 독립적인 다중기기 세션 지원
- [x] 신규 사용자 / 복귀 사용자 / 활성 기존 사용자 분류
- [x] 최근 12개 완료 라운드 기준 복귀 사용자 판정
- [x] 자기 초대 차단
- [x] 한 지갑의 중복 추천 관계 차단
- [x] 서로 다른 VeBetterDAO dApp 3개의 실제 양수 B3TR 보상 확인
- [x] 첫 인정 dApp 보상 이후 실제 B3TR → VOT3 전환 1회 확인 (0보다 큰 수량이면 인정)
- [x] 인정 전환 이후 Allocation Voting 확인
- [x] 온체인 증빙 기반 미션 진행도
- [x] Sybil CLEAR / REVIEW / BLOCKED 검토 흐름
- [x] 성공적인 온보딩의 추천 보상 대상을 초대자 지갑으로 고정
- [x] 보상 큐, 보상 라운드, immutable manifest, 자동 서명·제출, finalized 검증 및 PAID 정산 구조
- [x] 전용 Reward Distributor와 app-admin 역할 분리
- [x] distributor 주소와 signing secret 일치 검증 및 fail-closed readiness
- [x] 자동 지급 작업 중복 실행 방지 operator lock 및 crash recovery
- [x] 보상 라운드 배정 후 Sybil 판정 변경 방지
- [x] 실제 VeBetterDAO Round / `AllocationRewardsClaimed` 영수증과 VeInvite 보상 라운드 연결
- [x] allocation의 전체 금액 / 운영 몫 / 추천 보상 풀 / 이월 / 실제 지급 장부
- [x] 동일 VeBetterDAO 라운드 및 allocation 영수증 중복 사용 방지
- [x] allocation 없는 구형 reward-round 생성 경로 차단
- [x] 라운드별 신규·복귀·기존 활성·온보딩·성공 추천·실지급 통계 엔진
- [x] 라운드별 보고와 누계 리더보드/API 분리
- [x] 공식 신규·복귀 통계의 변경 불가 시작 라운드 잠금 장치
- [x] 완료 라운드 성장 보고서의 불변 스냅샷·명시적 수정 버전
- [x] 일일 reconciliation / automatic-reward recovery cron
- [x] 동일 피추천 지갑의 동시 다중 초대 수락을 DB 고유 제약으로 차단
- [x] Privacy / Terms 및 기본 공개 메타데이터
- [x] Production에서 Preview/demo 전용 진단·완료 경로 차단
- [x] 익명 초대 조회의 지갑 관계·상세 진행도 최소 공개
- [x] `/admin/*` 전체 서버 측 운영자 인증

## 2. 현재 추천 보상 운영 원칙

VeInvite는 피추천자의 dApp 활동, B3TR → VOT3 전환, Allocation Voting에 동일 행동을 이유로 추가 B3TR을 지급하지 않습니다. 추천 보상 대상은 신규 또는 복귀 사용자를 실제 검증된 온보딩 완료까지 연결한 **초대자**입니다.

Production 자동 추천 보상 파이프라인은 활성화되어 있고 readiness 검사를 통과해야 실행됩니다. 그러나 다음 조건이 하나라도 없으면 지급은 fail-closed 됩니다.

- 실제 VeBetterDAO allocation과 사용 가능한 추천 보상 풀
- 변경 불가능한 entry eligibility 증빙
- 세 개의 서로 다른 qualifying dApp B3TR 보상 증빙
- 순서가 검증된 B3TR → VOT3 전환 및 Allocation Voting
- 최신 Sybil `CLEAR`
- reconciliation / impact evidence 완전성
- 유효한 reward queue 및 reward round
- distributor 등록·설정·pause 상태 정상
- 제출 트랜잭션의 finalized 체인 검증

지급액과 시점은 실제 추천 보상 풀, 이월액, 최종 검증 대상 수와 체인 상태에 따라 달라질 수 있으며 고정 금액이나 날짜를 보장하지 않습니다.

## 3. 아직 완료되지 않은 실제 운영 검증

2026-09-03 기준 Production에는 모든 지급 조건을 완료한 실제 eligible referral이 없어 최초 genuine automatic B3TR payout은 아직 발생하지 않았습니다. 가짜 referral을 만들어 지급 경로를 테스트하지 않습니다.

첫 실제 eligible referral이 생기면 다음 항목을 반드시 대조합니다.

- [ ] allocation receipt가 올바른 VeBetterDAO 라운드에 연결되었는지
- [ ] eligible referral만 reward queue에 진입했는지
- [ ] reward round와 immutable manifest가 예상 대상/금액으로 생성되었는지
- [ ] 전용 Reward Distributor가 올바른 수신자와 금액으로 트랜잭션을 생성했는지
- [ ] tx ID / raw signed transaction / submission 기록이 일치하는지
- [ ] finalized 검증 이전에는 절대로 PAID가 되지 않는지
- [ ] finalized 이후 payout, invitation, receipt, accounting 상태가 모두 일치하는지
- [ ] 재실행해도 동일 payout이 중복 지급되지 않는지

## 4. 백그라운드 동기화와 복구

페이지가 열려 있는 활성 초대는 완료 조건 확인 시 best-effort reward iteration을 시도합니다. 독립 fallback cron은 현재 Vercel Hobby 제한에 맞춰 일 1회 실행되며 reconciliation, 자동 지급 복구, reporting, housekeeping, monitoring을 수행합니다.

페이지를 닫은 상태에서도 더 짧은 복구 목표가 필요해지면 더 높은 빈도의 외부 스케줄러 또는 상위 호스팅 플랜을 검토합니다. 제품 규칙을 약화시키거나 클라이언트가 보상 정산의 단일 실행 주체가 되게 하지는 않습니다.

## 5. 공개 운영에서 계속 확인할 항목

- Production health / 최신 배포 revision / runtime 오류
- 신규·복귀·활성 기존 사용자 분류 비율
- 초대 생성 → 자격 확인 → 미션 완료 전환율
- 반복되는 이탈 구간
- Sybil REVIEW/BLOCKED 사례
- reward queue와 eligibility evidence의 일치 여부
- allocation / 추천 보상 풀 / 이월 / 실제 지급액의 장부 일치
- 자동 지급 lock, recovery, finalized 검증 상태
- 만료 wallet challenge/session/rate-limit 데이터의 housekeeping
- 공개 API가 필요 이상의 지갑·운영 정보를 노출하지 않는지

## 6. 향후 안정화 우선순위

- [ ] 첫 genuine automatic payout E2E 검증
- [ ] 실제 운영 데이터가 쌓인 뒤 Sybil 신호와 threshold 재평가
- [ ] 다수 피추천 지갑에서 한 지갑으로 B3TR이 모이는 패턴을 위한 별도 Transfer-event 인덱서/검토 보고서
- [ ] 모바일 viewport를 포함한 Playwright 브라우저 E2E·접근성·시각 회귀검사
- [ ] 보상 규모가 크게 증가할 경우 Reward Distributor signing material을 managed signer/HSM 계열로 이전 검토

## 7. UI/UX 변경 원칙

문구 수정 외에 레이아웃, 구조, 버튼 배치, 색상, 그래픽 등 사용자에게 보이는 UI/UX 변경은 별도 검토합니다. 기능·보안 수정 과정에서 사용자 흐름을 불필요하게 바꾸지 않고, 실제 변경이 필요한 경우 모바일·다국어 영향을 함께 검증합니다.
