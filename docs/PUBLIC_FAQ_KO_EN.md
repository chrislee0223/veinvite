# VeInvite Public FAQ — 한국어 / English

Last updated: 2026-09-03

This document is public-facing copy. It must stay aligned with Production behavior and must not promise a fixed reward amount or payout date.

---

## 한국어

### VeInvite가 무엇인가요?
VeInvite는 VeBetterDAO에 처음 참여하거나 오랜 기간 활동하지 않았던 사용자가 실제 온체인 활동을 통해 생태계에 참여하도록 돕는 초대형 온보딩 앱입니다.

### 누가 참여할 수 있나요?
다음 중 하나에 해당하는 지갑이 참여 대상입니다.
- 이전 VeBetterDAO 보상·Allocation Voting 이력이 확인되지 않는 신규 사용자
- 과거 활동 이력은 있지만 최근 12개 완료 라운드 동안 인정되는 VeBetterDAO 보상 및 Allocation Voting 이력이 없는 복귀 사용자

최근 활동이 확인되는 기존 활성 사용자는 VeInvite 대상이 아니며 VeBetterDAO 자체는 계속 정상적으로 이용할 수 있습니다.

### 복귀 사용자는 어떻게 판단하나요?
과거 VeBetterDAO 활동 이력은 있으나 최근 12개 완료 라운드 동안 인정되는 dApp 보상과 Allocation Voting 이력이 모두 없는 경우 복귀 사용자로 분류될 수 있습니다.

### 어떤 미션을 완료해야 하나요?
1. 서로 다른 VeBetterDAO dApp 3개에서 활동하고 실제 양수 B3TR 보상을 받기
2. 첫 번째 인정 dApp 보상 이후 최소 1 B3TR을 새로 VOT3로 전환하기
3. 해당 전환 이후 Allocation Voting에 1회 참여하기

첫 번째 인정 dApp 보상 이후에는 VOT3 전환과 투표 미션을 먼저 진행하고 남은 dApp 활동을 이어서 완료해도 됩니다. 0 B3TR 지급 이벤트는 dApp 보상 미션으로 인정되지 않습니다.

### 앱을 계속 켜 두어야 하나요?
아니요. 인정되는 dApp 보상, B3TR → VOT3 전환, Allocation Voting 기록은 온체인에서 확인됩니다. 네트워크나 인덱싱 지연이 있으면 반영까지 시간이 걸릴 수 있습니다. VeInvite는 독립적인 reconciliation/recovery 작업도 수행합니다.

### 아무 dApp 사용이나 인정되나요?
아닙니다. VeInvite는 실제 VeBetterDAO 보상 시스템에서 확인되는 양수 B3TR 보상 이벤트를 기준으로 진행도를 계산합니다. 보상을 발생시키지 않은 단순 접속이나 모든 형태의 dApp 상호작용이 자동으로 인정되는 것은 아닙니다.

### 자기 초대가 가능한가요?
아니요. 자기 초대는 허용되지 않습니다.

### 같은 지갑으로 여러 초대 링크에 참여할 수 있나요?
아니요. 한 지갑은 하나의 VeInvite 추천 관계에만 연결될 수 있습니다.

### 이미 수락한 초대를 취소할 수 있나요?
수락 완료된 초대는 취소할 수 없습니다. 아직 아무 지갑도 수락하지 않은 초대만 취소할 수 있습니다.

### 참여 자격이 없는 사람이 링크를 열면 초대가 사라지나요?
최근 활동 때문에 현재 참여 대상이 아닌 기존 활성 사용자가 거절된 경우 해당 초대가 자동으로 소비되지 않도록 설계되어 있습니다.

### 누가 VeInvite 추천 보상을 받나요?
초대받은 사용자가 dApp 활동, B3TR → VOT3 전환, Allocation Voting을 했다는 이유로 VeInvite가 그 사용자에게 B3TR을 추가 지급하는 구조가 아닙니다. 초대받은 사용자는 각 dApp 또는 VeBetterDAO에서 원래 제공되는 보상만 받습니다. 신규 또는 복귀 사용자를 실제 검증된 온보딩 완료까지 연결한 **초대자**가 최종 검증 후 VeInvite 추천 보상 대상이 될 수 있습니다.

### 추천 보상은 언제, 얼마나 지급되나요?
온보딩 완료만으로 초대자의 즉시 지급이 확정되는 것은 아닙니다. 온체인 미션 증빙, 최종 Sybil CLEAR, 실제 VeBetterDAO allocation과 사용 가능한 추천 보상 풀, reward round 및 최종 체인 검증이 모두 충족되어야 지급될 수 있습니다. 지급 시점과 금액은 실제 추천 보상 풀, 이월 금액, 최종 검증 대상 수와 체인 상태에 따라 달라질 수 있습니다. 고정 보상액이나 지급 날짜는 보장하지 않습니다.

Production의 자동 추천 보상 파이프라인은 활성화되어 있지만 조건이 하나라도 불완전하면 fail-closed로 지급하지 않습니다. 2026-09-03 기준 모든 지급 조건을 완료한 실제 Production 추천이 아직 없어 최초 genuine automatic B3TR payout은 발생하지 않았습니다.

### 자동 보상 때문에 운영자 지갑 개인키를 앱에 넣나요?
아니요. 앱 관리자 지갑과 전용 Reward Distributor는 역할이 분리되어 있습니다. 지급용 signing secret은 서버 전용이며 브라우저·클라이언트·공개 API로 전달되지 않습니다. VeInvite 사용자에게는 어떤 경우에도 개인키나 시드 문구를 요구하지 않습니다.

### VeInvite가 개인키나 시드 문구를 요구하나요?
아니요. VeInvite는 개인키나 시드 문구를 요구하지 않습니다. 지갑 인증이 필요한 경우에도 사용자가 자신의 지갑에서 직접 서명합니다.

### 활동 이력을 확인할 수 없다는 오류가 나오면 어떻게 하나요?
VeInvite는 블록체인/인덱서 데이터를 신뢰할 수 없을 때 임의로 통과시키지 않습니다. 잠시 후 다시 시도해 주세요. 확인 실패만으로 초대를 강제로 소비하지 않도록 설계되어 있습니다.

### Sybil 검토는 무엇인가요?
비정상적인 다중 지갑 보상 획득을 줄이기 위한 최종 검토 단계입니다. 단일 약한 신호만으로 사용자를 자동 차단하지 않고 애매한 경우 REVIEW 상태로 남겨 추가 확인할 수 있도록 설계되어 있습니다. 보상 지급에는 최종적으로 `CLEAR`가 필요합니다.

---

## English

### What is VeInvite?
VeInvite is a referral-based onboarding app designed to help new and genuinely returning users enter the VeBetterDAO ecosystem through verifiable on-chain activity.

### Who can participate?
A wallet may qualify if it is either:
- new to VeBetterDAO, with no prior qualifying reward or Allocation Voting history found; or
- a returning wallet with older activity but no qualifying VeBetterDAO reward or Allocation Voting activity during the previous 12 completed rounds.

Wallets with recent VeBetterDAO activity are not currently eligible for VeInvite, but they can continue using VeBetterDAO normally.

### How is a returning user determined?
A returning wallet may qualify when older VeBetterDAO activity exists but there has been no qualifying dApp reward activity and no Allocation Voting activity during the previous 12 completed rounds.

### What missions must be completed?
1. Earn a positive B3TR reward from three different VeBetterDAO dApps.
2. After the first qualifying dApp reward, newly convert at least 1 B3TR to VOT3.
3. After that qualifying conversion, participate in Allocation Voting once.

After the first qualifying dApp reward, the conversion and voting missions may be completed before the remaining dApp rewards. A zero-B3TR reward event does not count toward the dApp mission.

### Do I need to keep VeInvite open?
No. Qualifying dApp rewards, B3TR-to-VOT3 conversion, and Allocation Voting activity are verified on-chain. Network or indexing delays may cause progress to appear later. VeInvite also runs independent reconciliation/recovery work.

### Does any dApp interaction count?
No. VeInvite tracks positive B3TR reward events emitted through the VeBetterDAO reward system. Simply opening an app, or an interaction that does not produce a qualifying reward, is not automatically counted.

### Can I invite myself?
No. Self-referrals are not allowed.

### Can one wallet join through multiple invite links?
No. A wallet can only be attached to one VeInvite referral relationship.

### Can an accepted invitation be cancelled?
No. An invitation that has already been accepted cannot be cancelled. Only an unused invitation with no invitee attached can be cancelled.

### Does an ineligible active user consume the invite?
If a wallet is rejected because recent VeBetterDAO activity makes it an active existing user, the invitation is designed not to be consumed by that rejection.

### Who receives a VeInvite referral reward?
VeInvite does not pay the invited user additional B3TR merely for the dApp, B3TR-to-VOT3, or Allocation Voting actions used to verify onboarding. The invitee receives only the normal rewards available from the relevant dApps or VeBetterDAO. The **inviter** may qualify for a VeInvite referral reward after an eligible new or returning user completes verified onboarding and passes the final checks.

### When and how much is a referral reward paid?
Verified onboarding does not guarantee an immediate payout to the inviter. On-chain mission evidence, final Sybil CLEAR, an actual VeBetterDAO allocation and available referral reward pool, reward-round preparation, and final chain verification must all succeed before a payout can complete. Timing and amount may vary with the actual referral reward pool, carry-over funds, the final number of verified referrals, and chain conditions. VeInvite does not guarantee a fixed amount or payout date.

The Production automatic referral-reward pipeline is enabled, but it fails closed whenever a required condition is incomplete. As of September 3, 2026, no genuine Production referral has satisfied every payout requirement, so the first genuine automatic B3TR payout has not yet occurred.

### Does automatic payout put an operator private key in the app?
No. The app-admin wallet and the dedicated Reward Distributor are separate roles. Distributor signing material is server-only and is not sent to browser/client code or public APIs. VeInvite never asks a user for a private key or seed phrase.

### Does VeInvite ever ask for my seed phrase or private key?
No. VeInvite never asks for a seed phrase or private key. When wallet verification is required, the user signs directly in their own wallet.

### What if VeInvite cannot verify my activity history?
VeInvite fails closed when blockchain or indexing data cannot be trusted. Please try again later. A temporary verification failure is not treated as proof of eligibility.

### What is Sybil review?
It is a final anti-abuse review intended to reduce multi-wallet reward farming. Weak signals alone are not treated as conclusive proof; ambiguous cases can remain under REVIEW for further checking. A final `CLEAR` state is required for payout eligibility.
