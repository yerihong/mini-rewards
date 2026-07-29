# Decisions

HeyMax Product take-home (~4–5 hours).

## What I built

1. Partner **activity webhook** credits points
2. User checks **balance** and **history**
3. User **redeems** from a seeded reward catalog

Angular for the UI, Express for the API (same code exports as a Cloud Function), Firestore for storage. Runs on the Firestore Emulator so you don't need a Firebase project to try it.

## What I prioritized after core flow

The assignment asks you to finish the happy path first, then spend remaining time on what matters for production. Once earn / balance / redeem / history worked, I focused on **webhook idempotency**, **atomic redeem**, and **input validation**. Partner retries and accidental double-credits are painful to unwind — similar to payment webhooks I've handled in production.

## Design choices

### Ledger + balance

Each earn/redeem writes a `transactions` row and updates `users.balance` in one Firestore transaction. Balance is what the UI reads; the ledger is for auditing.

### Idempotent webhooks

Partners retry deliveries. `processedEvents/{eventId}` ensures the same `eventId` never credits twice. A replay returns `duplicate: true` with the original transaction id.

### Atomic redeem

Reward cost and balance are read inside `runTransaction`, so two redeems at once can't overdraw. If balance is too low, the API returns `409` and writes nothing.

### Users and rewards

| Path | Behaviour |
|------|-----------|
| Earn webhook | Creates the user if missing (webhook can arrive before login) |
| Balance GET | Unknown user → `0` |
| Redeem | Unknown user → `404`; missing/inactive reward → `404` / `409` |

### Auth

Webhook: `X-Webhook-Secret` header (demo uses `demo-secret`). User: pick a `userId` in the UI — no login. I skipped real auth to keep time for ledger and webhook correctness.

### API layer

The Angular app never writes to Firestore directly. All mutations go through the API.

## Trade-offs

| Chose | Instead of | Why |
|-------|------------|-----|
| Emulator + seed script | Hosted Firebase | Reviewers can run without credentials |
| Shared webhook secret | HMAC signing | Good enough for a demo; signing is the real next step |
| One Express app | Split Cloud Functions | Easier to run locally |
| Simple UI | Full design system | Enough to walk through the flow |

## If this went to production

1. HMAC webhook signing + per-partner secrets
2. Real user auth (Firebase Auth or similar)
3. Structured logging on webhooks; metrics on earn/redeem failures
4. Outbox/retry for downstream side effects after credit
5. Reward stock limits, per-user caps, market-specific catalogs
6. Refunds as new ledger rows (`type: "refund"`, linked to original tx) — not built here, but the ledger supports it
7. Internal ops console for multi-user lookup

## How to verify

| Scenario | Expected |
|----------|----------|
| Same `eventId` twice | `duplicate: true`, balance unchanged |
| Concurrent redeems, balance for one | One `200`, one `409` |
| `points` ≤ 0 or decimal | `400`; earn button disabled in UI |
| 40 pts earned, redeem Coffee (50) | `409 INSUFFICIENT_BALANCE` |
| Earn 100, redeem Coffee (50) | Balance 50; history shows both |

`npm test` for validation. `npm run demo:curl` for a full curl walkthrough. Setup steps in [README.md](./README.md).
