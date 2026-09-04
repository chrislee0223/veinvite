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

## 신규·복귀 사용자 언어 조회

초대를 실제로 수락한 신규·복귀 사용자의 앱 표시 언어는 일반 익명 방문 통계와 분리해서 조회한다.

### 지갑 단위 상세

`operator_accepted_wallet_languages`

주요 필드:

- `entry_class`: `NEW` 또는 `RETURNING`
- `acceptance_kind`: 현대 진입 검증은 `MODERN`, 검증된 과거 분류는 `LEGACY`
- `display_language`: 현재 확인된 앱 표시 언어. 아직 기록이 없으면 `null`
- `display_language_source`: 현재 표시 언어가 결정된 방식
- `saved_preference_language`: 해당 지갑에 명시적으로 저장된 언어 설정
- `has_saved_preference`: 명시적 지갑 언어 설정 존재 여부
- `first_observed_at`, `last_observed_at`: 표시 언어를 처음/마지막으로 확인한 시각
- `preference_updated_at`: 명시적 지갑 언어 설정이 마지막으로 저장된 시각

`display_language_source` 의미:

- `browser_auto`: 브라우저 언어를 자동 감지해 표시 중
- `local_storage`: 해당 브라우저에 남아 있던 앱 언어를 표시 중
- `wallet_preference`: 해당 지갑에 이미 저장된 언어 설정을 적용 중
- `manual_selection`: 인증된 상태에서 사용자가 직접 언어를 바꿈

브라우저 자동 감지나 `local_storage` 값은 **현재 표시 상태 관측값**이지, 그 지갑의 영구 선호를 뜻하지 않는다. 여러 기기에 적용되는 명시적 지갑 선호는 사용자가 인증된 상태에서 직접 언어를 바꿨을 때만 `saved_preference_language`로 저장된다.

### 신규·복귀 × 언어 요약

`operator_accepted_language_summary`

예시:

```sql
select *
from public.operator_accepted_language_summary
order by entry_class, participant_count desc, display_language;
```

이 뷰는 `NEW`/`RETURNING`별로 현재 표시 언어와 참여자 수를 집계하고, 그중 몇 명이 저장된 선호를 갖고 있는지와 언어 출처별 수를 함께 보여준다.

`display_language = 'unknown'`은 아직 저장된 선호도 없고 배포 이후 표시 언어 관측도 없다는 뜻이다. 과거 데이터에서 언어를 추정하거나 임의로 채우지 않는다.

### 해석 규칙

- **언어는 국가나 국적이 아니다.** `de`라고 해서 독일 사용자, `ko`라고 해서 한국 국적이라고 보고하지 않는다.
- 운영 질문에는 “영어 표시 사용자”, “한국어 표시 지갑”처럼 표현한다.
- 실제 국가별 유입을 알고 싶다면 별도의 개인정보·정책 검토가 필요한 기능이며 현재 언어 데이터로 대체하지 않는다.
- 이 두 언어 뷰는 `analytics_excluded_wallets`를 존중하고, 공식 신규/복귀 funnel의 modern/verified-legacy 분류와 같은 기준을 사용한다.
- 운영자 전용 `service_role` 조회면이며 공개 클라이언트에 직접 노출하지 않는다.

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
