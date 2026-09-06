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

독립적으로 바로 열 수 있는 실제 상태는 `src/qa/directStateCoverage.ts`에서 Production 컴포넌트와 연결한다. `/qa/state`는 이 연결만 사용하며, 해당 컴포넌트의 QA fixture가 명시적으로 활성화된 경우에만 실제 상태를 강제로 렌더링한다.

## Coverage 단계

- `direct`: 해당 상태를 독립적으로 바로 열어 실제 Production 컴포넌트에서 확인할 수 있음
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
3. 가능하면 실제 Production 컴포넌트 + deterministic fixture로 직접 재현한다.
4. 독립 재현이 가능하면 `directStateCoverage.ts`에 연결하고, 점검 흐름이 필요하면 `scenarioRegistry.ts`에도 시나리오를 등록한다.
5. 관련 코드가 삭제되면 상태도 삭제 또는 lifecycle을 변경한다.
6. CI Architecture Gate와 이후 자동화가 stale/missing coverage를 확인한다.

## 구현 원칙

- QA에서 Production UI를 비슷하게 다시 그리지 않는다.
- 가능한 한 실제 Production 컴포넌트에 가짜 상태만 주입한다.
- QA fixture가 활성화되면 실제 API/지갑/분석/내비게이션 mutation보다 먼저 fail closed 한다.
- 정상 Production route는 QA fixture prop을 절대 전달하지 않는다.
- Production API/DB/지갑/보상 쓰기는 QA renderer에서 실행하지 않는다.
- 화면 상태(State Coverage)와 상태 간 이동(Transition Coverage)은 별도로 관리한다.
- 운영에서 발견된 실제 버그는 수정 후 회귀 상태/시나리오로 남긴다.

## 첫 direct coverage wave

영구 추천 `/r/[key]` 흐름은 실제 `PermanentReferralClient`에 명시적인 QA-only deterministic state injection을 추가해 다음 상태를 독립 재현한다.

- 초기 로고 / 첫 언어 선택 / 링크 확인 중 / 정상 랜딩
- 지갑 연결 필요 / 연결 완료 / 자격 확인 중
- 신규 성공 / 복귀 성공
- 잘못된 링크 / 슬롯 가득 참 / 기존 활성 사용자 / 자기 초대 / 이미 다른 추천에 연결 / 일시적 자격 확인 오류

QA mode에서는 링크 검증 fetch, VeWorld 연결창 실행, claim analytics/network 작업, 미션 페이지 이동 전에 중단한다. 정상 `/r/[key]` route는 이 QA prop을 전달하지 않는다.

## 두 번째 direct coverage wave

지갑 세션과 약관 게이트는 실제 Production gate 안의 동일한 UI surface를 QA에서도 사용하고, QA fixture일 때 네트워크/지갑 동작을 먼저 차단한다.

지갑 세션 직접 재현:

- 초기 세션 로고
- 소유권 확인 전 지연 로고
- 지갑 소유권 확인 중
- 지갑 세션 확인 실패
- 연결 지갑과 기존 세션 지갑 불일치
- 세션/지갑 연결 해제 중

약관 직접 재현:

- 약관 동의 여부 확인 중
- 약관/개인정보 동의 필요
- 동의 저장 중
- 약관 확인/저장 오류

`SESSION-PASSIVE-DISCONNECT-RECOVERY`처럼 화면 자체보다 시간/이벤트 순서가 핵심인 항목은 억지로 direct 화면으로 올리지 않고 Transition Coverage에서 별도 검증한다.

## 세 번째 direct coverage wave

Home / Reward는 `HomeClient` 자체를 그대로 렌더링하고, QA 전용 wallet-launcher override와 브라우저 API interceptor로 상태만 가짜로 주입한다. Home UI를 별도로 복제하지 않는다.

Home 직접 재현:

- 지갑 미연결 / 지갑 연결창 여는 중
- 홈 초기 로딩 / 초대 링크 로딩 / 초대 링크 오류
- 슬롯 로딩 / 빈 슬롯 / 대기 / 진행 / 검토 / 완료 / 2개 슬롯 사용 중
- 기존 초대 취소 확인 팝업

Reward 직접 재현:

- 보상 수령 가능
- 보상 수령 처리 중
- 보상 요청 완료(queued)

QA Home harness는 같은 origin의 `/api/*` 요청을 실제 배포 API로 보내지 않고 fixture 응답으로 처리한다. 정의하지 않은 애플리케이션 API 요청은 503으로 fail closed 한다. 지갑 열기/전환/연결 해제 동작도 QA override 안에서는 no-op이며, locale·referral session cache·`window.fetch`는 fixture 종료 시 원래 값으로 복원한다.

아직 transient snackbar 자체가 핵심인 `HOME-COPY-SUCCESS`, `HOME-COPY-ERROR`, `HOME-LOAD-ERROR`, `REWARD-CLAIM-ERROR` 등은 억지로 정적 화면으로 고정하지 않고 다음 interaction/transition fixture wave에서 직접 재현한다.

## 네 번째 direct coverage wave

알림은 별도 모양을 다시 그리지 않고 실제 `InviteNotificationHistoryCenter`와 `InviteNotificationSurfaceV2`를 QA harness에서 직접 사용한다. 네트워크 요청 없이 fixture만 전달하므로 알림 확인·오류·로딩·이벤트 화면을 안전하게 독립 재현한다.

알림 센터 직접 재현:

- 알림 없음 / 읽지 않은 알림 배지
- 알림 이력 열림 / 로딩 / 오류
- 읽은 항목 / 읽지 않은 항목 / 과거 알림 더 보기

이벤트 알림 직접 재현:

- 초대 수락
- dApp 1/3, 2/3, 3/3
- VOT3 전환
- 건너뛴 진행 단계를 합쳐 보여주는 진행 알림
- 보상 준비 / 보상 지급 완료
- 참여 불가
- 알림 확인 처리 중 / 확인 처리 오류

QA 알림 harness의 확인·전체 읽음·더 보기·닫기 동작은 브라우저 내부 상태만 바꾸며 API를 호출하지 않는다. 따라서 Production 알림 읽음 기록이나 보상/초대 데이터에 영향을 주지 않는다.

## 다음 확장 순서

1. Leaderboard loading/error/movement/detail 독립 상태
2. `/i/[code]` legacy flow 전체 상태
3. transient Home/Reward feedback + Transition Registry
4. Journey Runner
5. changed-screen 영향 감지, stale verdict, Playwright/Visual Regression

현재 상태 목록은 완성 선언이 아니라 **누락을 숨기지 않는 기준선**이다. `missing`이 0이 되고 direct coverage가 실제 Production 컴포넌트에 연결됐을 때 현재 운영 UI State Coverage를 100%라고 표시한다.
