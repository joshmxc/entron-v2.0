# Entron Production Security Review

Date: 2026-11-24

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | server/src/services/messages.service.ts | 33 | Bulk messaging loads guest IDs without filtering by eventId, allowing cross-event guest-message delivery. | 10/10 |
| 2 | 🟠 HIGH | server/src/routes/guests.ts | 19 | Guest reads and mutations operate on a guest ID without confirming it belongs to the event in the route. | 9/10 |
| 3 | 🟠 HIGH | server/src/routes/payments.ts | 10 | Payment initiation, lookup, and callbacks lack event assignment and provider-payload verification controls. | 9/10 |
| 4 | 🟡 MEDIUM | server/src/routes/scans.ts | 12 | Batch scan synchronization can bypass staff event-assignment checks because event IDs can be embedded inside array items. | 9/10 |
| 5 | 🟡 MEDIUM | server/src/middleware/auth.ts | 10 | Access-token authentication does not recheck that a user still exists, is active, or has the token's current role. | 9/10 |
| 6 | 🟠 HIGH | server/src/routes/payments.ts | 10 | Payment callbacks do not verify provider signatures or validate amount, currency, and transaction data. | 9/10 |
| 7 | 🟡 MEDIUM | server/src/routes/invitations.ts | 9 | WhatsApp delivery webhooks update records without provider-origin or signature verification. | 10/10 |

## Notes

- The production build completed successfully.
- Live dashboard content loaded successfully during the production check.
- Security findings above require provider-specific callback verification and broader event/tenant authorization testing before public SaaS launch.
