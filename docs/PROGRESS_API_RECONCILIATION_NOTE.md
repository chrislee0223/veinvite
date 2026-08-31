# Invite progress reconciliation

Public invite progress reads are intentionally split by HTTP semantics:

- `GET /api/invites/:code` is passive and reads the last verified state only.
- `POST /api/invites/:code` performs the bounded on-chain reconciliation pass and may trigger the independently guarded automatic reward worker when the referral becomes completed and eligible.

This keeps link previews, crawlers, prefetchers, and cross-site navigations from causing expensive on-chain reads or reward-worker iterations. Browser POST requests are protected by the centralized same-origin / Fetch Metadata mutation guard. Cron remains the independently authenticated recovery path.
