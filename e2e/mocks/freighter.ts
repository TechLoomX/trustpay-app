// Mocks the Freighter browser extension's actual public contract: it
// injects `window.freighter = true` (the fast-path @stellar/freighter-api's
// isConnected() checks for) and answers the window.postMessage protocol
// every other freighter-api call goes through — a request
// `{source: "FREIGHTER_EXTERNAL_MSG_REQUEST", messageId, type, ...}` gets a
// reply `{source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: <same
// messageId>, ...}` (yes, "messagedId" — that's the real property name the
// installed @stellar/freighter-api@6 build checks, typo included; verified
// by reading node_modules/@stellar/freighter-api/build/index.min.js).
//
// This is the standard way to exercise a real Freighter-integrated dapp in
// Playwright without installing the actual extension (which isn't
// practical in headless CI).
import type { Page } from '@playwright/test';

const STORAGE_KEY = '__tp_mock_wallet__';

export async function installFreighterMock(page: Page, defaultAddress: string): Promise<void> {
  await page.addInitScript((initialAddress: string) => {
    const KEY = '__tp_mock_wallet__';
    let currentWallet = window.localStorage.getItem(KEY) || initialAddress;

    // @ts-expect-error - injecting the extension's marker global
    window.freighter = true;
    // @ts-expect-error - test hook, not part of the app
    window.__TP_SET_WALLET__ = (address: string) => {
      currentWallet = address;
      window.localStorage.setItem(KEY, address);
    };

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string; messageId?: number; transactionXdr?: string };
      if (!data || data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return;

      const respond = (payload: Record<string, unknown>) => {
        window.postMessage(
          { source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: data.messageId, ...payload },
          window.location.origin,
        );
      };

      switch (data.type) {
        case 'REQUEST_ACCESS':
        case 'REQUEST_PUBLIC_KEY':
          respond({ publicKey: currentWallet });
          break;
        case 'REQUEST_ALLOWED_STATUS':
          respond({ isAllowed: true });
          break;
        case 'REQUEST_CONNECTION_STATUS':
          respond({ isConnected: true });
          break;
        case 'SUBMIT_TRANSACTION':
          // The mock Soroban RPC never checks signatures, so echoing the
          // unsigned envelope back as "signed" is enough to keep it valid,
          // parseable XDR.
          respond({ signedTransaction: data.transactionXdr, signerAddress: currentWallet });
          break;
        case 'SUBMIT_BLOB':
          respond({ signedBlob: btoa(`mock-signature-${Date.now()}`), signerAddress: currentWallet });
          break;
        default:
          break;
      }
    });
  }, defaultAddress);
}

export async function setMockWallet(page: Page, address: string): Promise<void> {
  await page.evaluate((addr: string) => {
    // @ts-expect-error - test hook, not part of the app
    window.__TP_SET_WALLET__(addr);
  }, address);
}
