## What this PR does



## Related issue

Closes #

## Checklist

- [ ] `npm run lint` passes locally
- [ ] `npx tsc --noEmit` passes locally
- [ ] `npm test` passes locally, and I added/updated tests for the behavior this PR changes
- [ ] `npm run build` succeeds
- [ ] If this touches a contract-calling function in `lib/stellar.ts`, I confirmed it still matches `trustpay-contract`'s current function signatures and error enum
- [ ] If this touches Supabase reads/writes, I confirmed it still works under RLS as the relevant wallet (not just as an admin/service key locally)
- [ ] If this adds a new env var, I updated `.env.example`
- [ ] No transaction signing was routed through the backend instead of the wallet directly

## How this was tested

<!-- Describe manual/testnet verification if applicable, beyond the automated test suite -->
