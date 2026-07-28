/**
 * Serialize small state objects to a compact, URL-safe string and back.
 * Used for shareable permalink presets (?p=...).
 *
 * Encoding: JSON -> UTF-8 -> base64url (no padding, `+/` mapped to `-_`).
 * Relies on the global btoa/atob, present in browsers and Node >= 16.
 */

/** Encode a JSON-serializable value as a URL-safe string. */
export function encodeState(state: unknown): string {
  const json = JSON.stringify(state);
  // Encode UTF-8 so non-ASCII survives the base64 round-trip.
  const utf8 = unescape(encodeURIComponent(json));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a string produced by encodeState. Returns null on any malformed input. */
export function decodeState<T = unknown>(encoded: string): T | null {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const utf8 = atob(b64);
    const json = decodeURIComponent(escape(utf8));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
