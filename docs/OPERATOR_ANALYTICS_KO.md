# VeInvite 운영 분석 기준

이 문서는 운영 질문에 언제나 같은 기준으로 답하기 위한 지표 사전이다.

## 질문과 기본 보고서

| 운영 질문 | 보고서 | 기본 정렬 기준 |
|---|---|---|
| 지금까지 보상을 가장 많이 받은 유저 100명 | `reward-recipients` | 실제 지급된 VeInvite B3TR 누적액 |
| 지금까지 초대를 가장 많이 한 유저 100명 | `inviters` | 생성한 초대 수 |
| 미션 중 dApp 보상을 가장 많이 받은 유저 | `qualifying-dapp-rewards` | 검증된 dApp 보상 누적액 |
| 현재 전체 운영 현황 | `overview` | 전체 초대·완료·지급·검토 요약 |

`reward-recipients`와 `qualifying-dapp-rewards`는 의미가 다르다. 전자는 VeInvite가 추천인에게 실제 지급한 보상이고, 후자는 초대받은 사용자가 미션 과정에서 받은 것으로 검증된 dApp 보상이다.

## 데이터 신뢰 기준

- 실제 VeInvite 지급액은 변경할 수 없는 `reward_receipts`만 집계한다.
- dApp 보상은 초대 활성화 이후 온체인에서 확인되어 `invite_impact_events`에 저장된 `DAPP_REWARD`만 집계한다.
- 초대 순위에는 생성 수와 함께 실제 참여, 신규·복귀 판정, 완료, 지급, Sybil 검토 수를 같이 제공한다.
- 모든 분석 뷰는 `anon`과 `authenticated`에 공개하지 않고 서버의 `service_role`만 조회할 수 있다.
- 앱의 `/api/admin/analytics`도 서명된 지갑 세션과 실제 보상 운영자 지갑 검증을 모두 통과해야 한다.

## API 예시

- `/api/admin/analytics?report=reward-recipients&limit=100`
- `/api/admin/analytics?report=inviters&limit=100`
- `/api/admin/analytics?report=qualifying-dapp-rewards&limit=100`
- `/api/admin/analytics?report=overview`

응답은 조회 시각, 네트워크, 지표 정의, 원본 뷰 이름, 행 수와 표 데이터로 구성된다. 조회 요청은 데이터를 수정하거나 보상을 전송하지 않는다.

## 아직 포함하지 않는 범위

일반 지갑 간 B3TR 전송 전체는 아직 수집하지 않는다. 따라서 “여러 초대 지갑의 보상이 나중에 한 지갑으로 모였는가”를 자동 판정하려면 별도의 B3TR 전송 인덱서와 의심 신호 보고서가 추가로 필요하다. 현재 분석 구조는 그 보고서를 별도 지표로 붙일 수 있게 분리되어 있다.
