# trustpay-app

Next.js 14 (App Router) + TypeScript + Tailwind frontend for TrustPay, a
milestone-based crypto escrow product built on Stellar/Soroban.

This is the client the user actually touches. It talks to two independent
backends and keeps them strictly separate — see "Design decision" below.

## Design decision: wallet-direct-to-contract, never through the backend

Money-moving actions — `deposit`, `submit_milestone`, `approve_milestone`,
`raise_dispute`, `refund`, `cancel_escrow`, and `create_escrow` — are built
and signed **in the browser**, by the user's own Freighter wallet, and
submitted **directly to Soroban RPC**. `trustpay-api` never sees these
transactions, never co-signs them, and never proxies them. All of that logic
lives in [`lib/stellar.ts`](lib/stellar.ts), which talks straight to the
deployed contract:

```text
CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2  (testnet)
```

Everything else — titles, descriptions, dashboard lists, notifications — goes
through `trustpay-api`'s Supabase project, read and written with the anon key
under Row Level Security. The frontend never holds or uses the service role
key.

If a future change ever routes a transaction through `trustpay-api` instead
of the wallet, that's a bug against this design, not a feature — the backend
is intentionally unable to move funds.

## Repo layout

```text
app/
  page.tsx                       # landing / connect wallet
  dashboard/page.tsx             # "As Client" / "As Freelancer" lists
  projects/new/page.tsx          # create escrow form
  projects/[id]/page.tsx         # project detail, milestone actions
  projects/[id]/history/page.tsx # derived transaction history
components/
  wallet/       # WalletProvider (context), ConnectButton
  escrow/       # ProjectCard, MilestoneList, MilestoneActionButton, CreateEscrowForm
  layout/       # Header, NotificationBell
lib/
  stellar.ts    # contract invoke helpers — the only file that signs transactions
  supabase.ts   # Supabase client (anon key), wired to the wallet-auth JWT
  auth.ts       # challenge/verify orchestration against trustpay-api
  hash.ts       # description hashing — must match the contract's and API's
  errors.ts     # decodes the contract's Error enum into readable messages
  types.ts      # domain types mirrored from trustpay-contract / trustpay-api
test/           # vitest + Testing Library
```

## Setup

Requires Node.js 20+, a Freighter wallet browser extension, and a running
`trustpay-api` (or its hosted Supabase project).

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

### Environment variables (`.env.example`)

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `trustpay-api`'s Supabase project (`supabase status` locally) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same project — **anon key only**, never the service role key |
| `NEXT_PUBLIC_API_URL` | Base URL for `trustpay-api`'s Edge Functions (`.../functions/v1`) |
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed escrow contract address, from `trustpay-contract` |
| `NEXT_PUBLIC_RPC_URL` | Soroban RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Must match the network the contract was deployed to |

## Running against testnet

1. Deploy `trustpay-contract` to testnet (see that repo's README) and copy
   the resulting contract ID into `NEXT_PUBLIC_CONTRACT_ID`.
2. Start `trustpay-api` (`supabase start`, apply migrations, serve the Edge
   Functions) or point at its hosted project, and fill in the Supabase
   variables above.
3. Install [Freighter](https://www.freighter.app/), switch it to Testnet,
   and fund the test accounts you'll use via
   [Friendbot](https://developers.stellar.org/docs/tools/developer-tools#friendbot).
4. `npm run dev`, connect a wallet as the "client", create an escrow with the
   "freelancer" wallet's address, deposit into a milestone, then switch
   wallets and submit → approve it. Status changes should appear live via
   Supabase Realtime without a page refresh — the indexer in `trustpay-api`
   is what mirrors on-chain events into Postgres for that to work, so it
   needs to be running too.

## Auth flow

Connecting a wallet runs the challenge/verify flow against `trustpay-api`
(see [`lib/auth.ts`](lib/auth.ts)):

1. Freighter returns the public key.
2. `POST {API_URL}/auth-challenge` with that address returns a message to sign.
3. Freighter's `signMessage` (never `signTransaction` — no funds move here)
   signs it.
4. `POST {API_URL}/auth-verify` with the signature returns a
   Supabase-compatible JWT (`wallet_address` custom claim).
5. That token is handed to the Supabase client via its `accessToken` option,
   so every REST call and Realtime subscription is scoped by RLS
   automatically — no separate authorization checks in components.

If the token is about to expire, [`lib/supabase.ts`](lib/supabase.ts) silently
re-runs steps 2–4 (just a signature, not a transaction) before the next
request goes out.

## Testing

```bash
npm run typecheck
npm test
```

Covers: the wallet connect → challenge/verify flow, Create Escrow form
validation (blocks submission before it ever reaches the wallet), that each
`lib/stellar.ts` function invokes the correct contract method with the
correct arguments, contract error decoding for every variant in
`errors.rs`, the full role/status action matrix, and a Realtime
`postgres_changes` payload updating a milestone's displayed status with no
reload.

## Known gaps

- `trustpay-api`'s schema doesn't have a dedicated `events` table yet, so
  Transaction History is derived from milestone timestamps instead, and
  links out to the escrow contract's Stellar Expert page rather than a
  specific transaction hash. See the comment in
  [`app/projects/[id]/history/page.tsx`](<app/projects/[id]/history/page.tsx>).
- Decoding a contract error out of a transaction that fails *after*
  submission (rather than during pre-flight simulation, where essentially
  all business-logic errors actually surface) isn't implemented — see the
  comment in `lib/stellar.ts`.
- Milestone amounts are passed to the contract as raw integers in the
  token's smallest unit; the form doesn't yet do decimal-aware conversion
  for a specific token.
