# Architecture

## Frontend
- Next.js App Router
- VeChain Kit / VeWorld wallet connection
- Korean-first responsive UI

## Backend MVP
- Next.js route handlers
- Demo in-memory state store
- Eligibility and activation verification interfaces

## Production replacement
- PostgreSQL/Supabase
- Atomic invitation claim transaction
- Official VeBetterDAO event/indexer integration
- VePassport risk checks
- Reward worker using X2EarnRewardsPool
- Managed secrets and audit logs

## State machine

AVAILABLE → PENDING_ACCEPTANCE → ACTIVATING → COMPLETED

Optional branch: ACTIVATING → UNDER_REVIEW → ACTIVATING/REJECTED

Cancellation can occur from PENDING_ACCEPTANCE or ACTIVATING and results in CANCELLED + reward forfeiture.
