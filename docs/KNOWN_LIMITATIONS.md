# Known Limitations of v0.1

- The current store is in memory and resets when the server restarts.
- Atomic first-claim ownership is only reliable inside one server process. Production must use a database transaction and unique constraints.
- VeBetterDAO usage history, three-app activity, B3TR earning, VOT3 conversion, voting, and VePassport checks are currently represented by integration interfaces and demo outcomes.
- No live B3TR is distributed by this repository. The reward distributor and X2EarnRewardsPool integration must remain server-side.
- Privacy and terms pages are drafts and require legal review before mainnet.
- Device fingerprinting is not implemented. It should remain optional and privacy-minimizing.
