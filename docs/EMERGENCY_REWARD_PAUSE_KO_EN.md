# VeInvite Emergency Reward Pause / 긴급 보상 중지 절차

This runbook defines how VeInvite stops and resumes referral reward distribution when abnormal activity or a security incident is suspected. It follows the Security and Anti-Farming Framework recommendation to maintain an admin-controlled pause, clear activation criteria, a resume review process, and communication templates.

이 문서는 비정상 활동이나 보안 사고가 의심될 때 VeInvite 추천 보상을 중지하고 다시 시작하는 절차를 정의합니다. 관리자 제어 중지 기능, 명확한 발동 기준, 재개 검토 절차, 공지 템플릿을 운영 기준으로 사용합니다.

## 1. What the pause stops / 무엇이 중지되는가

When either VeBetterDAO's on-chain distribution pause or VeInvite's emergency runtime pause is active, VeInvite blocks creation of new reward liabilities and new reward settlement actions:

- creating a new fixed completion-time reward reservation;
- preparing a new reward round;
- freezing a new payout manifest;
- payout preflight and signing of a new B3TR transaction.

온체인 중지 또는 VeInvite 긴급 중지 중 하나라도 활성화되면 새로운 고정 보상 예약 생성, 새 보상 라운드 생성, 새 지급 manifest 확정, 신규 B3TR 지급 서명 전 검증을 차단합니다.

Mission tracking, invitation history, security review, and read-only reporting remain available. Existing fixed reservations and financial evidence are preserved; a pause does not erase or reprice an already recorded entitlement. If a payout transaction was already broadcast before the pause, registration and finalized on-chain verification remain available so the transaction can be reconciled accurately. A pause must never erase or hide financial evidence.

미션 추적, 초대 기록, 보안 검토, 조회용 리포트는 계속 동작합니다. 이미 생성된 고정 보상 예약과 금융 증거는 그대로 보존되며, 긴급 중지는 기존 예약 금액을 삭제하거나 재계산하지 않습니다. 중지 전에 이미 지급 트랜잭션이 전송된 경우에는 해당 tx의 등록 및 finalized 검증을 계속 수행해 회계 기록을 정확히 확정합니다. 긴급 중지는 기존 금융 증거를 삭제하거나 숨기지 않습니다.

## 2. Activation criteria / 발동 기준

The operator should activate the emergency pause immediately when one or more of the following is observed and the risk cannot be safely explained:

- unusual growth in reward claims or repeated wallet clusters;
- suspected Sybil/farming activity that may bypass existing checks;
- abnormal reward-pool withdrawals, balance changes, or transaction patterns;
- a discovered authentication, eligibility, manifest, or payout vulnerability;
- inconsistent on-chain and database reward evidence;
- compromised or suspected-compromised operator credentials;
- failure of a critical security dependency where continuing payouts would require guessing.

다음 상황이 발생하고 정상적인 원인으로 즉시 설명되지 않으면 긴급 중지를 발동합니다: 보상 청구 급증 또는 지갑 군집, 기존 검사를 우회하는 시빌/파밍 의심, 비정상 보상 풀 출금·잔액·트랜잭션 패턴, 인증·자격·manifest·지급 취약점 발견, 온체인/DB 증거 불일치, 운영자 자격 증명 탈취 의심, 핵심 보안 의존성 장애로 안전한 지급 판단이 불가능한 경우.

## 3. Pause procedure / 중지 절차

1. Verify the operator wallet session and current reward-pool status.
2. Activate `SET_EMERGENCY_REWARD_PAUSE` with a concrete incident reason. Reasons must be 12-500 characters.
3. Confirm the effective pause state is `true`.
4. Record the incident time, affected round/manifest if any, and supporting evidence.
5. Do not create a new fixed reward reservation or sign a new payout transaction while the pause is active.
6. If a transaction was already broadcast, reconcile that transaction only; do not send a replacement.
7. Publish the appropriate user notice if the pause affects an expected payout window.

모든 pause/resume 변경은 `reward_emergency_pause_events`에 운영 지갑, 네트워크, 사유, 시각과 함께 기록됩니다.

## 4. Resume review / 재개 검토

Rewards may resume only after all applicable checks pass:

- the incident cause has been identified or the suspicious signal has been disproven;
- affected invitations, wallets, fixed reservations, reward rounds, and manifests have been reviewed;
- no unresolved transaction is at risk of being sent twice;
- VePassport/Sybil and reward evidence checks are healthy;
- current reward-pool balance and configuration match expected values;
- any required fix has passed Preview/testnet validation and production deployment checks;
- the operator records a clear resume reason.

재개는 단순히 시간이 지났다는 이유로 하지 않습니다. 원인 규명, 대상 초대·지갑·고정 예약 검토, 중복 지급 위험 제거, 보안 검증 정상화, 보상 풀 상태 확인, 필요한 수정의 Preview/testnet 검증이 끝난 뒤 재개 사유를 기록해야 합니다.

## 5. Communication templates / 공지 템플릿

### Pause — English

> VeInvite referral reward distribution has been temporarily paused while we review unusual activity. Invitations and mission progress remain available. No new reward amount will be fixed and no new reward payout will be signed until the review is complete. We will share an update when distribution is safe to resume.

### 중지 — 한국어

> 비정상 활동 확인을 위해 VeInvite 추천 보상 지급을 일시 중지했습니다. 초대와 미션 진행은 계속 이용할 수 있으며, 검토가 끝날 때까지 새로운 보상 금액 고정 및 지급 트랜잭션 승인을 진행하지 않습니다. 안전하게 재개할 수 있는 시점에 다시 안내드리겠습니다.

### Resume — English

> VeInvite referral reward distribution has resumed after completing the security review. The reward queue, fixed reservations, and payout evidence were checked before resuming. Thank you for your patience.

### 재개 — 한국어

> 보안 검토를 완료해 VeInvite 추천 보상 지급을 재개했습니다. 재개 전에 보상 대기열, 고정 예약, 지급 증거를 다시 확인했습니다. 기다려 주셔서 감사합니다.

## 6. Testing rule / 테스트 원칙

Pause/resume behavior must be drilled in Preview/testnet before relying on it in production. The drill must verify both transitions, audit-event creation, that new fixed reservations are blocked while paused, and that the effective reward gate changes without sending B3TR. Production tests must not toggle the pause merely for experimentation when real payouts are active.
