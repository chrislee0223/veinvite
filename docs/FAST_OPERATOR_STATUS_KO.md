# VeInvite 고속 운영 현황 집계 기준

## 목적

`유저 현황 / 방문자 현황` 조회가 원본 테이블 전체를 매번 다시 스캔하지 않도록, 원본 데이터와 분리된 읽기 전용 projection을 유지합니다.

원본 invitations, wallet authentication/event ledger, anonymous usage sessions가 항상 진실의 원장입니다. 고속 projection은 자격 판정, Sybil 판정, 보상 큐, 보상 준비 또는 지급의 권한이 없습니다.

## 시간 기준

- 방문자 일별 통계: `Asia/Seoul` 오전 00:00 기준
- `오늘`: KST 00:00 ~ 현재
- rolling 24시간을 기본 운영 지표로 사용하지 않습니다.

## 관리자 제외

`analytics_excluded_wallets`의 active 지갑을 운영 통계에서 제외합니다.

지갑 주소가 없는 익명 방문 분석은 주소를 저장하거나 역추적하지 않습니다. 관리자로 인증된 익명 visitor는 `app_usage_excluded_visitors`를 통해 그날의 익명 통계에서 제외합니다.

## 언어 기준

언어는 국가나 국적을 의미하지 않습니다.

하루에 한 익명 visitor가 여러 언어를 선택해도 별도 클릭 수나 사용시간 임계값을 만들지 않습니다. 그날 가장 마지막으로 실제 앱에 설정되어 사용된 `current_locale` 하나를 해당 visitor의 대표 언어로 집계합니다.

예: `en → ja → vi`로 변경하고 마지막 상태가 `vi`이면 그날은 베트남어 사용자 1명입니다.

## 고속 projection

- `operator_fast_wallets`: 누적 인증 지갑 1행/지갑
- `operator_fast_wallet_days`: 일별 인증 지갑 1행/지갑/일
- `operator_fast_invitations`: 초대 1행/초대
- `operator_fast_usage_visitors`: 익명 방문자 1행/방문자/일
- `operator_fast_reconciliation_log`: 원본-vs고속 대조 기록

전역 카운터 한 행에 모든 요청이 동시에 쓰지 않습니다. 원본 데이터가 바뀔 때 영향받은 좁은 projection 행만 갱신합니다.

## 재구축

`rebuild_operator_fast_projections()`로 projection 전체를 원본에서 다시 생성할 수 있습니다.

누적 지갑 인증은 보안상 임시인 `wallet_auth_sessions`만 의존하지 않고 장기 `veinvite_event_ledger`의 `WALLET_AUTHENTICATED` 이벤트도 함께 사용합니다.

## 정확도 검증

`compute_operator_raw_status()`는 고속 테이블을 사용하지 않고 원본에서 직접 계산합니다.

`reconcile_operator_fast_status()`는 고속 결과와 원본 결과를 비교하고 결과를 `operator_fast_reconciliation_log`에 남깁니다. 기존 일일 운영 cron에서도 이를 실행하며 불일치 시 운영 실패로 표시합니다.

고속 projection 불일치는 운영 보고 문제이며 보상/자격 원본을 수정하지 않습니다.

## 개인정보 보관

익명 고속 방문자 projection은 원본 usage session과 동일한 30일 보관 경계를 가집니다.

30일 초과 데이터는 identifier-free 일별 rollup으로 확정한 뒤 원본 session, visitor 식별자 및 고속 visitor projection을 삭제합니다. locale rollup은 visitor별 그날 최종 `current_locale` 기준입니다.

## 성능 검증 기준

Preview에서 확인한 기준:

- 현재 소규모 데이터: `read_operator_fast_status()` 약 9ms
- 가상 일일 visitor projection 100,000행: 약 137ms

가상 성능 데이터는 트랜잭션 안에서 생성 후 전부 롤백했습니다.
