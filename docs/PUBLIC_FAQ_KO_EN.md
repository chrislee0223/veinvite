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

### 초대 링크는 매번 새로 만들어야 하나요?
아니요. 초대자는 자신의 **영구 초대 링크 1개**를 계속 사용할 수 있습니다. 친구 한 명이 온보딩을 완료해도 같은 링크를 다시 공유하면 됩니다.

### 동시에 몇 명까지 초대할 수 있나요?
자격을 충족한 친구는 **동시에 최대 2명까지** 진행할 수 있습니다. 두 슬롯 중 하나가 비면 같은 영구 링크로 다음 친구가 참여할 수 있습니다.

단순히 링크를 열어본 것만으로는 슬롯이 사용되지 않습니다. 지갑 인증과 신규·복귀 참여 자격 확인을 통과해 실제 온보딩이 시작될 때만 슬롯이 배정됩니다.

기존에 이미 만들어져 공유된 일회용 초대 링크는 계속 사용할 수 있으며, 아직 아무도 수락하지 않은 기존 링크는 사용 중인 슬롯 하나로 취급됩니다.

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
아니요. 한 지갑은 하나의 VeInvite 추천 관계에만 연결될 수 있습니다. 이미 다른 초대자에게 연결된 지갑은 새 영구 링크를 통해 추천자를 바꿀 수 없습니다.

### 이미 시작된 초대를 취소할 수 있나요?
아니요. 지갑이 자격 확인을 통과해 온보딩이 시작된 뒤에는 해당 추천 관계를 취소하거나 다른 추천자로 바꿀 수 없습니다. 기존 일회용 초대 중 아직 아무 지갑도 수락하지 않은 링크만 초대자가 취소할 수 있습니다. 영구 초대 링크 자체는 친구 한 명이 완료할 때마다 새로 만들거나 취소하는 방식이 아닙니다.

### 참여 자격이 없는 사람이 영구 링크를 열면 슬롯이 사라지나요?
아니요. 링크를 열기만 해서는 슬롯을 사용하지 않습니다. 최근 활동 때문에 현재 참여 대상이 아닌 활성 기존 사용자, 자기 초대, 이미 다른 추천 관계에 연결된 지갑, 일시적인 자격 확인 실패는 새 invitation을 만들지 않으며 슬롯도 소비하지 않습니다.

### 두 슬롯이 모두 사용 중이면 링크가 만료되나요?
아니요. 영구 링크는 그대로 유효합니다. 현재 진행 중인 친구 2명 중 한 명의 슬롯이 다시 사용 가능해진 뒤 같은 링크로 다시 시도하면 됩니다.

### Sybil 검토에서 차단되면 슬롯은 어떻게 되나요?
해당 invitation과 검토 기록은 감사 목적으로 보존됩니다. 다만 최종 `BLOCKED` 상태는 더 이상 진행 중인 친구 슬롯을 차지하지 않으므로 초대자는 그 슬롯을 다시 사용할 수 있습니다. 차단된 invitation은 추천 보상 대상이 아닙니다.

### 누가 VeInvite 추천 보상을 받나요?
초대받은 사용자가 dApp 활동, B3TR → VOT3 전환, Allocation Voting을 했다는 이유로 VeInvite가 그 사용자에게 B3TR을 추가 지급하는 구조가 아닙니다. 초대받은 사용자는 각 dApp 또는 VeBetterDAO에서 원래 제공되는 보상만 받습니다. 신규 또는 복귀 사용자를 실제 검증된 온보딩 완료까지 연결한 **초대자**가 최종 검증 후 VeInvite 추천 보상 대상이 될 수 있습니다.

### 두 친구를 모두 완료시키면 보상도 두 번 받을 수 있나요?
추천 보상 자격은 초대자 지갑당 한 번이 아니라 **검증 완료된 invitation별**로 판단합니다. 따라서 두 친구가 각각 모든 조건을 정상적으로 완료하고 최종 검증까지 통과하면 두 invitation은 각각 독립적인 보상 자격 검토 대상이 됩니다. 다만 실제 지급 금액과 시점은 보상 풀과 해당 라운드의 최종 조건에 따라 달라질 수 있습니다.

### 추천 보상은 언제, 얼마나 지급되나요?
온보딩 완료만으로 초대자의 즉시 지급이 확정되는 것은 아닙니다. 온체인 미션 증빙, 최종 Sybil CLEAR, 실제 VeBetterDAO allocation과 사용 가능한 추천 보상 풀, reward round 및 최종 체인 검증이 모두 충족되어야 지급될 수 있습니다. 지급 시점과 금액은 실제 추천 보상 풀, 이월 금액, 최종 검증 대상 수와 체인 상태에 따라 달라질 수 있습니다. 고정 보상액이나 지급 날짜는 보장하지 않습니다.

Production의 자동 추천 보상 파이프라인은 활성화되어 있지만 조건이 하나라도 불완전하면 fail-closed로 지급하지 않습니다. 2026-09-03 기준 모든 지급 조건을 완료한 실제 Production 추천이 아직 없어 최초 genuine automatic B3TR payout은 발생하지 않았습니다.

### 자동 보상 때문에 운영자 지갑 개인키를 앱에 넣나요?
아니요. 앱 관리자 지갑과 전용 Reward Distributor는 역할이 분리되어 있습니다. 지급용 signing secret은 서버 전용이며 브라우저·클라이언트·공개 API로 전달되지 않습니다. VeInvite 사용자에게는 어떤 경우에도 개인키나 시드 문구를 요구하지 않습니다.

### VeInvite가 개인키나 시드 문구를 요구하나요?
아니요. VeInvite는 개인키나 시드 문구를 요구하지 않습니다. 지갑 인증이 필요한 경우에도 사용자가 자신의 지갑에서 직접 서명합니다.

### 활동 이력을 확인할 수 없다는 오류가 나오면 어떻게 하나요?
VeInvite는 블록체인/인덱서 데이터를 신뢰할 수 없을 때 임의로 통과시키지 않습니다. 잠시 후 다시 시도해 주세요. 확인 실패만으로 영구 링크의 친구 슬롯을 소비하지 않도록 설계되어 있습니다.

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

### Do inviters need to create a new link every time?
No. Each inviter has **one permanent invite link** that can be shared repeatedly. The same link remains usable after a friend completes onboarding.

### How many friends can be in progress at once?
Up to **two eligible friends** can be in progress at the same time. When either reusable friend slot becomes available again, another friend can enter through the same permanent link.

Simply opening the link does not use a slot. A slot is reserved only after wallet verification and new/returning entry eligibility succeed and actual onboarding begins.

Existing one-time invite links that were already created or shared remain supported. An unused legacy link counts as one occupied slot until it is accepted or cancelled.

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
No. A wallet can only be attached to one VeInvite referral relationship. A wallet that is already attached to another inviter cannot switch sponsors through a new permanent link.

### Can an invitation be cancelled after onboarding starts?
No. Once a wallet passes entry verification and onboarding starts, that referral relationship cannot be cancelled or moved to another inviter. Only an unused legacy one-time invitation with no invitee attached can be cancelled. The permanent link itself is not recreated or cancelled after each friend.

### Does an ineligible user consume a permanent-link slot?
No. Opening the link alone never uses a slot. An active existing user with recent VeBetterDAO activity, a self-referral, a wallet already attached to another referral, or a temporary eligibility-check failure does not create a new invitation and does not consume a friend slot.

### What happens when both friend slots are already in use?
The permanent link does not expire. The visitor can use the same link again after one of the two current friend slots becomes available.

### What happens to a slot after a final Sybil block?
The invitation and review evidence remain preserved for audit. A final `BLOCKED` referral no longer occupies reusable concurrency capacity, so the inviter can use that friend slot again. The blocked invitation is not eligible for a referral reward.

### Who receives a VeInvite referral reward?
VeInvite does not pay the invited user additional B3TR merely for the dApp, B3TR-to-VOT3, or Allocation Voting actions used to verify onboarding. The invitee receives only the normal rewards available from the relevant dApps or VeBetterDAO. The **inviter** may qualify for a VeInvite referral reward after an eligible new or returning user completes verified onboarding and passes the final checks.

### Can two completed friends create two referral rewards?
Reward eligibility is evaluated **per verified invitation**, not once per inviter wallet. If two friends independently complete every requirement and pass final verification, each invitation can independently qualify for a referral reward. The actual amount and timing still depend on the funded reward pool and final round conditions.

### When and how much is a referral reward paid?
Verified onboarding does not guarantee an immediate payout to the inviter. On-chain mission evidence, final Sybil CLEAR, an actual VeBetterDAO allocation and available referral reward pool, reward-round preparation, and final chain verification must all succeed before a payout can complete. Timing and amount may vary with the actual referral reward pool, carry-over funds, the final number of verified referrals, and chain conditions. VeInvite does not guarantee a fixed amount or payout date.

The Production automatic referral-reward pipeline is enabled, but it fails closed whenever a required condition is incomplete. As of September 3, 2026, no genuine Production referral has satisfied every payout requirement, so the first genuine automatic B3TR payout has not yet occurred.

### Does automatic payout put an operator private key in the app?
No. The app-admin wallet and the dedicated Reward Distributor are separate roles. Distributor signing material is server-only and is not sent to browser/client code or public APIs. VeInvite never asks a user for a private key or seed phrase.

### Does VeInvite ever ask for my seed phrase or private key?
No. VeInvite never asks for a seed phrase or private key. When wallet verification is required, the user signs directly in their own wallet.

### What if VeInvite cannot verify my activity history?
VeInvite fails closed when blockchain or indexing data cannot be trusted. Please try again later. A temporary verification failure does not consume a permanent-link friend slot and is not treated as proof of eligibility.

### What is Sybil review?
It is a final anti-abuse review intended to reduce multi-wallet reward farming. Weak signals alone are not treated as conclusive proof; ambiguous cases can remain under REVIEW for further checking. A final `CLEAR` state is required for payout eligibility.
