// Shared, pure consent helpers for the reveal-identity flow (Slice 5b).
// No model imports — safe for both the employerPortal and seekerPortal modules.

export const REVEAL_EXPIRY_HOURS = 48;

export interface StoredConsent {
  status?: 'requested' | 'granted' | 'declined';
  requestedAt?: Date;
  expiresAt?: Date;
  respondedAt?: Date | null;
  remindedAt?: Date | null;
}

// A 'requested' consent whose expiresAt has passed reads as expired (derived, never stored).
export function isExpired(consent: StoredConsent | null | undefined, now: Date = new Date()): boolean {
  return !!consent && consent.status === 'requested' && !!consent.expiresAt
    && now.getTime() > new Date(consent.expiresAt).getTime();
}

export interface ConsentBlock {
  status: 'requested' | 'granted' | 'declined' | null;
  expired: boolean;
  requestedAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
}

// The projection block shared by the employer candidate/passport views. Null = never requested.
export function consentBlock(consent: StoredConsent | null | undefined, now: Date = new Date()): ConsentBlock | null {
  if (!consent || !consent.status) return null;
  return {
    status: consent.status,
    expired: isExpired(consent, now),
    requestedAt: consent.requestedAt ? new Date(consent.requestedAt).toISOString() : null,
    expiresAt: consent.expiresAt ? new Date(consent.expiresAt).toISOString() : null,
    respondedAt: consent.respondedAt ? new Date(consent.respondedAt).toISOString() : null,
  };
}
