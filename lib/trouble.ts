import { createHash } from 'node:crypto';

/**
 * event_participants is publicly readable (for the live crew lobby), so it stores
 * a SHA-256 hash of the device token, never the token itself. Knowing the hash
 * does not let anyone act as that guest.
 */
export function hashDeviceToken(token: unknown) {
  const t = typeof token === 'string' ? token.trim() : '';
  return t.length >= 16 && t.length <= 120 ? createHash('sha256').update(t).digest('hex') : null;
}

/** Experiences with a trouble_roles config use the collaborative Trouble crew flow. */
export function isCrewExperience(config: Record<string, unknown> | null | undefined) {
  return Array.isArray(config?.trouble_roles) && (config!.trouble_roles as unknown[]).length > 0;
}
