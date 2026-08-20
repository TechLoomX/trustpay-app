// Central place to read NEXT_PUBLIC_* config. Next.js inlines these at build
// time, so it's safe to read them at module scope in code that only runs in
// the browser (everything under lib/stellar.ts and lib/supabase.ts does).

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  apiUrl: () => required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
  contractId: () => required('NEXT_PUBLIC_CONTRACT_ID', process.env.NEXT_PUBLIC_CONTRACT_ID),
  rpcUrl: () => required('NEXT_PUBLIC_RPC_URL', process.env.NEXT_PUBLIC_RPC_URL),
  networkPassphrase: () =>
    required('NEXT_PUBLIC_NETWORK_PASSPHRASE', process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE),
};
