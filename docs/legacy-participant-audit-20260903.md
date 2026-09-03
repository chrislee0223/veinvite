# Legacy participant audit — 2026-09-03

This note records an audit boundary only. It does not grant reward eligibility.

## Finding

Four historically accepted invitations have a VERIFIED legacy NEW/RETURNING classification but no modern immutable `eligibility_check_id`:

- `5HXW4VP`
- `WVYTYY6`
- `3KH8K2W`
- `ZKBL7RZ`

The modern reconciliation batch intentionally requires an immutable entry eligibility proof, so these records are not current reward-authoritative reconciliation candidates.

One historical row (`5HXW4VP`) also carries the old database `COMPLETED` status even though the current mission set still requires explicit VOT3 conversion and Allocation Voting evidence. UI completion must therefore be derived from the current mission evidence fields, never from the legacy status label alone.

## Safety boundary

Do not populate `eligibility_check_id`, enqueue a reward, or rewrite historical invitation/referral evidence solely from this legacy classification table.

A future rehabilitation path, if approved, should be append-only and explicitly reviewed. It should preserve the original invitation and legacy-classification evidence, record the chosen checkpoint/network provenance, reconstruct current mission evidence from chain data where possible, and require an explicit resolution before any reward-authoritative state is created.
