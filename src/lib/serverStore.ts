import type { InviteRecord } from './types';

type DemoStore = {
  invites: Map<string, InviteRecord>;
  inviteeToCode: Map<string, string>;
};

declare global {
  // eslint-disable-next-line no-var
  var __veinviteDemoStore: DemoStore | undefined;
}

export const demoStore: DemoStore =
  globalThis.__veinviteDemoStore ?? {
    invites: new Map<string, InviteRecord>(),
    inviteeToCode: new Map<string, string>(),
  };

if (process.env.NODE_ENV !== 'production') {
  globalThis.__veinviteDemoStore = demoStore;
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function createCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

export function isActiveStatus(status: InviteRecord['status']): boolean {
  return ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW'].includes(status);
}
