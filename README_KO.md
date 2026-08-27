# VeInvite

VeInvite는 VeBetterDAO 신규 사용자 온보딩과 휴면 사용자 복귀를 검증형 추천 흐름으로 연결하는 dApp입니다.

## 현재 상태

현재 저장소는 단순 테스트넷 데모가 아니라 Production 운영을 전제로 한 구조를 포함합니다.

- Production: VeChain Mainnet + Supabase + Vercel
- VeChain Kit / VeWorld 지갑 연결 및 서버 측 지갑 소유권 검증
- 추천인당 동시 활성 초대 1개 제한
- 자기 추천 및 동일 invitee의 중복 추천 차단
- 초대 수락 시 온체인 이력으로 신규 / 복귀 / 기존 사용자 분류
- 복귀 사용자는 최근 12개 완료 VeBetterDAO 라운드와 현재 확인 블록까지 활동 여부 검증
- 초대 이후 서로 다른 VeBetterDAO dApp 3개의 보상 활동 검증
- 최소 1 B3TR의 직접 B3TR → VOT3 전환 검증
- VOT3 전환 이후 allocation governance vote 검증
- 온체인 impact evidence와 블록/트랜잭션/clause 실행순서 저장
- Sybil 검토 상태와 보상 자격을 DB 제약·트리거로 연동
- 보상 자격 완료 시 자동 reward queue 등록
- 주간 보상 계산 dry-run 및 reward accounting 안전장치
- VeBetterDAO Team Allocation 20% / 사용자 보상 몫 80% 설정 지원

## 중요한 운영 원칙

VeInvite의 `신규 사용자` 판정은 **확인 가능한 VeBetterDAO 보상 및 allocation vote 이력이 없는 지갑**을 뜻합니다. 한 지갑이 반드시 한 명의 실제 사람이라는 의미까지 증명하지는 않습니다.

`복귀 사용자`는 과거 qualifying 이력이 있지만 최근 12개 완료 라운드 및 초대 확인 시점까지 qualifying 활동이 감지되지 않은 지갑입니다. 신규 사용자와 복귀 사용자는 별도로 분류·보고합니다.

보상은 실제 온체인 미션 증거, 정상 entry eligibility, Sybil CLEAR 상태가 모두 충족되어야 `ELIGIBLE`이 됩니다. 증거가 불완전하거나 검증에 실패하면 fail-closed 방식으로 지급 대기 상태에 머뭅니다.

**자동 B3TR 전송은 현재 Production에서 활성화되어 있지 않습니다.** reward queue와 정산 안전장치를 먼저 검증한 뒤 별도 단계에서 활성화해야 합니다.

## 미션 흐름

1. 초대 링크를 통해 VeInvite 참여
2. 서로 다른 VeBetterDAO dApp 3개에서 qualifying B3TR 보상 활동 완료
3. 최소 1 B3TR을 VOT3로 직접 전환
4. 전환 이후 VeBetterDAO allocation governance vote 참여
5. 온체인 증거 및 Sybil 검토 통과
6. 다음 보상 라운드 대기열 등록

첫 dApp 보상 이후에는 VOT3 전환과 투표를 먼저 진행하고 나머지 dApp 미션을 나중에 완료해도 됩니다. 다만 실제 실행순서는 `첫 qualifying dApp 보상 → VOT3 전환 → governance vote`가 증명되어야 합니다.

## 개발 실행

1. Node.js 20 이상을 준비합니다.
2. 환경변수를 안전한 로컬/Preview 프로젝트에 설정합니다.
3. 의존성을 설치하고 실행합니다.

```bash
npm install
npm run dev
```

Preview 및 로컬 환경은 Production Supabase에 접근하지 못하도록 서버 가드가 적용되어 있습니다.

## 다음 개발 우선순위

- reward round 생성 및 정산 workflow 완성
- 실제 지급 전 idempotency / 재시도 / 부분 실패 복구 검증
- Sybil 신호 강화 및 운영자 검토 도구 보강
- 실제 신규 Production 사용자 1건의 전체 E2E 증거 체인 확인
- 자동 B3TR 지급은 위 검증 완료 후 별도 활성화
