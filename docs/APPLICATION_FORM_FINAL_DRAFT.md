# VeInvite — Creator’s NFT Application Draft

아래 내용을 신청 화면의 각 칸에 복사하여 사용합니다. URL, App ID, 지갑 주소, 이름과 이메일은 실제 값이 준비된 뒤 교체합니다.

## App Name

VeInvite

## App Description

VeInvite is a verified onboarding and ecosystem growth dApp for VeBetterDAO. It does not reward simple sign-ups or link clicks. Each participant may have only one active invitation at a time. An inviter becomes eligible for a referral reward only after the invited user connects a wallet, uses three different VeBetter apps, earns B3TR, converts B3TR to VOT3, votes, and passes duplicate-account, prior-use, invitation-ownership, and anti-farming checks. Once activation is confirmed, the inviter may invite the next user, and the activated participant receives their first invitation slot.

## How does your app distribute B3TR to the users?

VeInvite settles referral rewards weekly and does not promise a fixed B3TR amount. By default, 80% of the app’s available weekly allocation is assigned to the distributable user reward pool and 20% to a transparently disclosed treasury pool for operational and security costs. The distributable pool is shared proportionally among verified inviters whose referrals complete every activation requirement and pass anti-abuse verification during the applicable round. Cancelled invitations, existing VeBetterDAO users, duplicate referrals, self-referrals, reused links, and failed verification cases are excluded. Invitees do not receive a VeInvite referral reward, but retain any B3TR earned directly from the VeBetter apps they use.

## Project URL

[DEPLOYED_PROJECT_URL]

## Creator NFT Wallet Address

[CREATOR_NFT_PUBLIC_WALLET_ADDRESS]

## GitHub Username

[GITHUB_USERNAME]

## Email

[CONTACT_EMAIL]

## Name

[RESPONSIBLE_PERSON_NAME]

## Testnet Project URL

[DEPLOYED_TESTNET_URL]

## Testnet App ID

[VEBETTER_TESTNET_APP_ID]

## Security Requirements

- API Security Measures: 체크 — 지갑 서명 인증, rate limiting, CAPTCHA/bot protection, CORS 제한 및 서버 입력 검증 구현 후
- Action Verification: 체크 — 온체인/인덱서 기반 5개 활성화 조건 검증 구현 후
- Device Fingerprinting: 선택 체크 — 개인정보 최소화 및 위험 점수 보조 신호로만 구현할 경우
- Secure Key Management: 체크 — 사용자 개인키 미수집, distributor key를 secrets manager에 보관한 경우
- Anti-Farming Measures: 체크 — 1인 1추천인, 활성 초대 1개, 기존 이용자 제외, 최초 1인 귀속, 주간 정산, 검토 보류 구현 후

> 실제 구현이 끝나기 전에는 완료되지 않은 보안 항목을 체크하지 않습니다.
