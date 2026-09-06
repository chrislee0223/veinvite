# VeInvite Known State Inventory

QA Studio의 장기 기준은 **현재 Production 코드에서 사용자에게 보일 수 있는 VeInvite 자체 UI 상태를 모두 직접 재현 가능하게 만드는 것**이다.

## 100%의 의미

- 분모: 현재 Production 코드에서 실제 사용자에게 표시될 수 있는 VeInvite 자체 UI 상태
- 별도 관리: `/i/[code]` 과거 초대 호환 화면, 향후 기능
- 분모 제외: VeWorld 연결창, 브라우저/OS 공유창처럼 VeInvite가 직접 렌더링하지 않는 외부 UI
- 외부 UI의 성공/취소/실패 이후 VeInvite가 보여주는 결과 화면은 다시 분모에 포함한다.

## 상태와 시나리오를 분리하는 이유

`src/qa/stateRegistry.ts`는 Production 코드에 존재하는 상태의 **목록**이다. `src/qa/scenarioRegistry.ts`는 그 상태를 실제로 어떤 기기/언어/데이터로 보여주고 점검할지 정의하는 **재현 방법**이다.

상태 하나가 여러 언어와 기기 조합을 가질 수 있으므로 모든 조합을 별도 상태로 만들지 않는다. 이렇게 해야 시나리오가 불필요하게 폭발하지 않는다.

## Coverage 단계

- `direct`: 해당 상태를 독립적으로 바로 열어 확인할 수 있음
- `partial`: 실제 컴포넌트 또는 기존 Preview 안에서 볼 수 있지만 독립 상태 재현이 아직 부족함
- `missing`: Production 코드에는 근거가 있지만 QA에서 직접 강제 재현할 수 없음
- `external`: VeWorld/브라우저/OS가 렌더링하는 외부 UI

`partial`을 `direct`처럼 취급하지 않는다. QA 화면과 실제 Production 화면이 조금이라도 다를 수 있으면 부분 재현으로 남긴다.

## Lifecycle

- `production`: 현재 실제 앱에서 발생 가능
- `legacy`: 과거 초대 등 기존 사용자 호환을 위해 아직 발생 가능
- `future`: 아직 Production 기준에 포함하지 않는 향후 기능
- `external`: VeInvite 외부 시스템이 그리는 화면

## 새 기능을 만들 때

사용자에게 새 화면/팝업/오류/로딩 상태가 생기면 다음을 같이 한다.

1. `stateRegistry.ts`에 상태를 추가한다.
2. 실제 Production source path를 연결한다.
3. 가능하면 실제 Production 컴포넌트 + deterministic fixture로 직접 시나리오를 만든다.
4. `scenarioRegistry.ts`에 시나리오를 등록하고 state의 `scenarioIds`에 연결한다.
5. 관련 코드가 삭제되면 상태도 삭제 또는 lifecycle을 변경한다.
6. CI Architecture Gate와 이후 자동화가 stale/missing coverage를 확인한다.

## 구현 원칙

- QA에서 Production UI를 비슷하게 다시 그리지 않는다.
- 가능한 한 실제 Production 컴포넌트에 가짜 상태만 주입한다.
- Production API/DB/지갑/보상 쓰기는 QA renderer에서 실행하지 않는다.
- 화면 상태(State Coverage)와 상태 간 이동(Transition Coverage)은 별도로 관리한다.
- 운영에서 발견된 실제 버그는 수정 후 회귀 상태/시나리오로 남긴다.

## 다음 확장 순서

1. `missing` 중 critical 상태부터 실제 컴포넌트 기반 direct scenario로 전환
2. `/r/[key]` 전체 분기 직접 재현
3. 지갑 세션 / 약관 게이트 직접 재현
4. Home / Reward / Notification history direct fixtures
5. Leaderboard loading/error/movement/detail 독립 상태
6. `/i/[code]` legacy flow 전체 상태
7. Transition Registry + Journey Runner
8. changed-screen 영향 감지, stale verdict, Playwright/Visual Regression

현재 상태 목록은 완성 선언이 아니라 **누락을 숨기지 않는 기준선**이다. `missing`이 0이 되고 direct coverage가 실제 Production 컴포넌트에 연결됐을 때 현재 운영 UI State Coverage를 100%라고 표시한다.
