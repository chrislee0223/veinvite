# 다음 단계 — 공개 준비 상태

업데이트: 2026-08-28

이 문서는 과거의 초기 구축 체크리스트를 대체합니다. 현재 기준으로 VeInvite의 핵심 인프라와 검증 로직은 이미 구축되어 있으며, 앞으로는 공개 운영과 mainnet 보상 활성화를 별도 단계로 관리합니다.

## 1. 현재 완료된 핵심 영역

- [x] Next.js / Vercel Production 배포 구조
- [x] Production / Preview Supabase 분리
- [x] VeWorld 지갑 연결 및 지갑 서명 기반 세션 인증
- [x] 신규 사용자 / 복귀 사용자 / 활성 기존 사용자 분류
- [x] 최근 12개 완료 라운드 기준 복귀 사용자 판정
- [x] 자기 초대 차단
- [x] 한 지갑의 중복 추천 관계 차단
- [x] 서로 다른 VeBetterDAO dApp 3개 보상 확인
- [x] 첫 인정 dApp 보상 이후 B3TR → VOT3 전환 확인
- [x] 인정 전환 이후 Allocation Voting 확인
- [x] 온체인 증빙 기반 미션 진행도
- [x] Sybil CLEAR / REVIEW / BLOCKED 검토 흐름
- [x] 보상 큐, 보상 라운드, manifest, 트랜잭션 검증 구조
- [x] 보상 라운드 배정 후 Sybil 판정 변경 방지
- [x] Privacy / Terms 및 기본 공개 메타데이터
- [x] Production에서 Preview 전용 진단 경로 차단

## 2. 공개 온보딩 단계

현재 공개 시 사용할 문구와 운영 기준은 다음 문서를 따릅니다.

- `docs/PUBLIC_FAQ_KO_EN.md`
- `docs/SOCIAL_LAUNCH_COPY_KO_EN.md`
- `docs/FIRST_WEEK_OPERATIONS_20260828.md`
- `docs/LAUNCH_READINESS_20260824.md`

공개 전에는 Production health가 반드시 `200 / database ready / mainnet`인지 확인하고, 실제 보상 기능이 활성화되기 전에는 funded rewards가 이미 지급 중인 것처럼 홍보하지 않습니다.

## 3. 아직 남아 있는 외부 staging E2E 항목

실제 VeBetterDAO staging에서 한 신규 지갑이 서로 다른 3개 dApp 보상을 연속으로 받는 완전한 live-wallet E2E는 아직 최종 완료되지 않았습니다.

2026-08-28 체인 조사 결과, staging의 최근 실제 보상 활동이 제한적이어서 동일 지갑이 여러 dApp 보상을 받는 현실적인 테스트 경로가 확보되지 않았습니다. 이 항목은 제품 규칙을 낮추거나 가짜 완료 처리로 우회하지 않습니다.

세부 근거는 `docs/STAGING_E2E_READINESS_20260828.md`를 따릅니다.

## 4. Mainnet 사용자 보상 활성화 — 별도 게이트

공개 온보딩과 사용자 보상 지급은 같은 단계가 아닙니다.

다음 조건이 충족되기 전에는 mainnet 사용자 보상 지급을 활성화하지 않습니다.

- [ ] VeBetterDAO RuleBook/운영 정책상 현재 보상 구조가 명확히 허용되는지 확인
- [ ] 실제 funded reward pool 확보 및 출처 확인
- [ ] 운영자 preflight와 data-quality gate 통과
- [ ] 보상 라운드 생성 및 대상 동결 확인
- [ ] immutable payout manifest 생성
- [ ] VeWorld에서 운영자가 직접 지급 트랜잭션 승인
- [ ] 제출된 tx ID 등록
- [ ] finalized 체인 검증 성공
- [ ] 검증 완료 후에만 PAID 정산

서버에 운영 지갑의 개인키를 보관하거나 unattended 자동 송금을 활성화하지 않습니다.

## 5. 공개 후 첫 주

첫 주에는 기능 추가보다 실제 사용자 흐름과 데이터 품질을 우선합니다.

- Production 오류율과 health 확인
- 신규/복귀/활성 기존 사용자 분류 비율 확인
- 초대 생성 → 자격 확인 → 미션 완료 전환율 확인
- 반복되는 이탈 구간 확인
- Sybil REVIEW 사례 검토
- FAQ에 반복 문의 반영
- 보상 지급이 비활성 상태라면 실제 payout tx가 발생하지 않았는지 확인

## 6. UI/UX 변경 원칙

문구 수정 외에 레이아웃, 구조, 버튼 배치, 색상, 그래픽 등 사용자에게 보이는 UI/UX 변경은 바로 적용하지 않습니다. 변경이 필요하면 먼저 변경안을 보여주고 승인 후 구현합니다.
