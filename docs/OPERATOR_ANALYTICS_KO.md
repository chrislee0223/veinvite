# VeInvite 운영 분석 기준

이 문서는 운영 질문에 언제나 같은 기준으로 답하기 위한 지표 사전이다.

## 보고 범위

- 기본값은 현재 VeBetterDAO 한 라운드다: `scope=round`
- 특정 과거 라운드는 `roundId=<번호>`로 조회한다.
- 지금까지의 누계는 `scope=cumulative`로 조회한다.
- 라운드와 누계 모두 최대 100위까지 반환한다.

| 운영 질문 | 보고서 | 정렬 기준 |
|---|---|---|
| 이번 라운드 또는 누계 보상 상위 100명 | `reward-recipients` | 실제 지급된 VeInvite B3TR |
| 이번 라운드 또는 누계 초대 상위 100명 | `inviters` | 생성한 초대 수, 실제 참여 수 |
| 이번 라운드 또는 누계 미션 dApp 보상 상위 | `qualifying-dapp-rewards` | 검증된 dApp 보상액 |
| 이번 라운드 또는 누계 전체 현황 | `overview` | 초대·신규·복귀·완료·지급·검토 |

`reward-recipients`는 VeInvite가 추천인에게 실제 지급한 보상이다. `qualifying-dapp-rewards`는 초대받은 사용자가 미션 과정에서 받은 것으로 검증된 dApp 보상이며 지갑 전체 B3TR 수령액이 아니다.

## 데이터 신뢰 기준

- 실제 VeInvite 지급액은 변경 불가 `reward_receipts`만 집계한다.
- dApp 보상은 온체인 검증 후 저장된 `DAPP_REWARD`만 집계한다.
- 성공 추천은 진입 증거, 서로 다른 dApp 3개, VOT3 전환, 이후 투표의 원시 증거가 모두 있는 건만 센다.
- 증빙 없는 과거 데모/레거시 상태값은 성공 추천에서 제외하고 `legacy_unclassified_claims`로 분리한다.
- 신규·복귀는 초대 수락 시점의 고정된 진입 증거로 구분한다.
- 모든 보고 함수는 서버 `service_role` 전용이다. API도 서명 세션과 실제 보상 운영자 지갑을 모두 확인한다.

## API 예시

현재 라운드:

- `/api/admin/analytics?report=overview`
- `/api/admin/analytics?report=inviters&limit=100`
- `/api/admin/analytics?report=reward-recipients&limit=100`

특정 라운드:

- `/api/admin/analytics?scope=round&roundId=113&report=overview`

누계:

- `/api/admin/analytics?scope=cumulative&report=overview`
- `/api/admin/analytics?scope=cumulative&report=inviters&limit=100`
- `/api/admin/analytics?scope=cumulative&report=reward-recipients&limit=100`
- `/api/admin/analytics?scope=cumulative&report=qualifying-dapp-rewards&limit=100`

응답은 조회 시각, 네트워크, 범위, 지표 정의, 원본 함수, 행 수와 표 데이터를 포함한다. 조회 요청은 데이터를 수정하거나 보상을 전송하지 않는다.

## 아직 포함하지 않는 범위

일반 지갑 간 B3TR 전송 전체는 아직 수집하지 않는다. 따라서 여러 초대 지갑의 보상이 나중에 한 지갑으로 모였는지 자동 판정하려면 별도의 B3TR 전송 인덱서와 의심 신호 보고서가 필요하다. 한 가지 전송 패턴만으로 자동 차단하지 않고 운영 검토 대상으로 올려야 한다.
