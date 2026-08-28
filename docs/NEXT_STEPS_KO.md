# 다음 단계 — 공개 준비 상태

업데이트: 2026-08-28

이 문서는 과거의 초기 구축 체크리스트를 대체합니다. 현재 기준으로 VeInvite의 핵심 인프라와 검증 로직은 구축되어 있으며, 앞으로는 공개 운영과 mainnet funded referral rewards 활성화를 별도 단계로 관리합니다.

## 1. 현재 완료된 핵심 영역

- [x] Next.js / Vercel Production 배포 구조
- [x] Production / Preview Supabase 프로젝트 분리 및 Preview의 Production 접근 차단
- [ ] Vercel Preview 환경 변수를 Preview Supabase 프로젝트로 교정
- [x] VeWorld 지갑 연결 및 지갑 서명 기반 세션 인증
- [x] 신규 사용자 / 복귀 사용자 / 활성 기존 사용자 분류
- [x] 최근 12개 완료 라운드 기준 복귀 사용자 판정
- [x] 자기 초대 차단
- [x] 한 지갑의 중복 추천 관계 차단
- [x] 서로 다른 VeBetterDAO dApp 3개의 실제 양수 B3TR 보상 확인
- [x] 첫 인정 dApp 보상 이후 B3TR → VOT3 전환 확인
- [x] 인정 전환 이후 Allocation Voting 확인
- [x] 온체인 증빙 기반 미션 진행도
- [x] Sybil CLEAR / REVIEW / BLOCKED 검토 흐름
- [x] 성공적인 온보딩의 추천 보상 대상을 초대자 지갑으로 고정
- [x] 보상 큐, 보상 라운드, immutable manifest, tx 등록, finalized 검증 구조
- [x] 보상 라운드 배정 후 Sybil 판정 변경 방지
- [x] 실제 VeBetterDAO Round / `AllocationRewardsClaimed` 영수증과 VeInvite 보상 라운드 연결
- [x] allocation의 전체 금액 / 운영 몫 / 추천 보상 풀 / 이월 / 실제 지급 장부
- [x] 동일 VeBetterDAO 라운드 및 allocation 영수증 중복 사용 방지
- [x] allocation 없는 구형 reward-round 생성 경로 차단
- [x] 라운드별 신규·복귀·기존 활성·온보딩·성공 추천·실지급 통계 엔진
- [x] 라운드별 보고와 누계 리더보드/API 분리
- [x] 공식 신규·복귀 통계의 변경 불가 시작 라운드 잠금 장치
- [x] 완료 라운드 성장 보고서의 불변 스냅샷·명시적 수정 버전
- [x] 일일 reconciliation cron의 누락 라운드 자동 확정·변경 감지
- [x] 동일 피추천 지갑의 동시 다중 초대 수락을 DB 고유 제약으로 차단
- [x] 라운드 통계에 실제 VeBetterDAO Round와 allocation/이월 정보 연결
- [x] Privacy / Terms 및 기본 공개 메타데이터
- [x] Production에서 Preview 전용 진단 경로 차단

## 2. 공개 온보딩 단계

현재 공개 시 사용할 문구와 운영 기준은 다음 문서를 따릅니다.

- `docs/PUBLIC_FAQ_KO_EN.md`
- `docs/SOCIAL_LAUNCH_COPY_KO_EN.md`
- `docs/FIRST_WEEK_OPERATIONS_20260828.md`
- `docs/LAUNCH_READINESS_20260824.md`

공개 전에는 Production health가 반드시 `200 / database ready / mainnet`인지 확인하고, funded referral rewards가 실제로 활성화되기 전에는 지급이 이미 시작된 것처럼 홍보하지 않습니다.

VeInvite는 피추천자의 dApp 활동, B3TR → VOT3 전환, Allocation Voting에 별도의 중복 B3TR을 지급하지 않습니다. funded referral reward의 대상은 신규 또는 복귀 사용자를 실제 온보딩 완료까지 연결한 초대자입니다.

## 3. 외부 staging E2E 항목

실제 VeBetterDAO staging에서 한 신규 지갑이 서로 다른 3개 dApp 보상을 연속으로 받는 완전한 live-wallet E2E는 아직 최종 완료되지 않았습니다.

2026-08-28 체인 조사 결과, staging의 최근 실제 보상 활동이 제한적이어서 동일 지갑이 여러 dApp 보상을 받는 현실적인 테스트 경로가 확보되지 않았습니다. 이 항목은 제품 규칙을 낮추거나 가짜 완료 처리로 우회하지 않습니다.

세부 근거는 `docs/STAGING_E2E_READINESS_20260828.md`를 따릅니다.

독립 백그라운드 동기화는 현재 일 1회 fallback cron이다. 페이지가 열려 있을 때는 더 자주 동기화되지만, 닫힌 페이지의 미완료 건까지 1시간 이내에 갱신하려면 더 높은 빈도의 외부 스케줄러 또는 호스팅 플랜이 필요하다.

## 4. Mainnet funded referral rewards — 별도 게이트

공개 온보딩과 추천 보상 지급은 같은 단계가 아닙니다.

다음 조건이 충족되기 전에는 mainnet funded referral rewards를 활성화하지 않습니다.

- [ ] VeBetterDAO RuleBook/운영 정책상 현재 inviter-only referral reward 구조에 대한 최종 확인
- [ ] 실제 funded reward pool 확보 및 on-chain allocation receipt 확인
- [ ] 지급에 사용할 reason/proof 형식을 운영 정책과 맞게 최종 확정
- [ ] 운영자 preflight와 data-quality gate 통과
- [ ] 보상 라운드 생성 및 대상 동결 확인
- [ ] immutable payout manifest 생성
- [ ] VeWorld에서 운영자가 직접 지급 트랜잭션 승인
- [ ] 제출된 tx ID 등록
- [ ] finalized 체인 검증 성공
- [ ] 검증 완료 후에만 PAID 정산

서버에 운영 지갑의 개인키를 보관하거나 unattended 자동 송금을 활성화하지 않습니다.

## 5. 실제 출시 시 한 번 설정할 항목

- [x] 공식 시작 라운드 이전 개발/테스트 기록을 공개 누계에서 제외하는 구조와 검증 완료
- [ ] 첫 공식 Production VeBetterDAO 라운드를 선택하고 변경 불가 기준선 잠금
- [ ] 첫 실제 VeBetterDAO allocation receipt가 장부에 자동 기록되는지 확인
- [ ] 다수 피추천 지갑에서 한 지갑으로 모이는 B3TR 전송을 찾는 별도 인덱서/검토 보고서 구축

## 6. 공개 후 첫 주

첫 주에는 기능 추가보다 실제 사용자 흐름과 데이터 품질을 우선합니다.

- Production 오류율과 health 확인
- 신규/복귀/활성 기존 사용자 분류 비율 확인
- 초대 생성 → 자격 확인 → 미션 완료 전환율 확인
- 반복되는 이탈 구간 확인
- Sybil REVIEW 사례 검토
- FAQ에 반복 문의 반영
- funded rewards가 비활성 상태라면 실제 payout tx가 발생하지 않았는지 확인
- 첫 라운드 통계의 allocation / 이월 / 실제 지급액이 온체인 장부와 일치하는지 확인

## 7. UI/UX 변경 원칙

문구 수정 외에 레이아웃, 구조, 버튼 배치, 색상, 그래픽 등 사용자에게 보이는 UI/UX 변경은 바로 적용하지 않습니다. 변경이 필요하면 먼저 변경안을 보여주고 승인 후 구현합니다.
