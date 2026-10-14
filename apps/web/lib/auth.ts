// Demo-grade portal auth: one shared password gates the whole app behind an
// HMAC-signed session cookie. This is NOT tenant-level authorization — the API
// itself already authenticates per-connector via Bearer apiKey (see
// apps/api/src/tenants.ts); this is just a login screen so the portal isn't
// wide open to anyone with the URL. Runs on both the Edge (middleware) and
// Node.js (server actions) runtimes, so it uses Web Crypto rather than
// node:crypto — both expose a global `crypto.subtle`.

export const SESSION_COOKIE = "pc_portal_session";
const SESSION_VALUE = "authenticated";

const DEFAULT_PASSWORD = "pc-core-demo";
const DEFAULT_SECRET = "pc-core-demo-secret-change-me";

function secret(): string {
  return process.env.PORTAL_AUTH_SECRET ?? DEFAULT_SECRET;
}

// Loud, once-per-process signal rather than a silent footgun: these two
// defaults are published in plaintext in the README, so leaving either one
// set in a real deployment means session cookies are forgeable (the secret)
// or the login is guessable by anyone who read the docs (the password).
if (process.env.NODE_ENV === "production") {
  if ((process.env.PORTAL_PASSWORD ?? DEFAULT_PASSWORD) === DEFAULT_PASSWORD) {
    console.error(
      "[pc-core] WARNING: running with NODE_ENV=production but PORTAL_PASSWORD is still the public default — set a real PORTAL_PASSWORD.",
    );
  }
  if ((process.env.PORTAL_AUTH_SECRET ?? DEFAULT_SECRET) === DEFAULT_SECRET) {
    console.error(
      "[pc-core] WARNING: running with NODE_ENV=production but PORTAL_AUTH_SECRET is still the public default — anyone who read the source can forge a session cookie. Set a real PORTAL_AUTH_SECRET.",
    );
  }
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(sig);
}

export async function makeSessionToken(): Promise<string> {
  return `${SESSION_VALUE}.${await hmac(SESSION_VALUE)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [value, sig] = token.split(".");
  if (!value || !sig) return false;
  return timingSafeEqual(sig, await hmac(value));
}

/** Plain `===` on a secret leaks its length/prefix through timing. Neither
 * Node's nor the Edge runtime's crypto module exposes a cross-runtime
 * constant-time string compare, so this does the XOR-accumulate version by
 * hand — same technique, no dependency. */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function checkPassword(password: string): boolean {
  const expected = process.env.PORTAL_PASSWORD ?? DEFAULT_PASSWORD;
  return password.length > 0 && timingSafeEqual(password, expected);
}

// ── brute-force guard ───────────────────────────────────────────────────────
// There's no per-user account to lock here — it's one shared password — so
// this throttles by caller instead. Deliberately simple (in-memory, this
// process only): it stops casual automated guessing against the shared
// password; it is NOT a substitute for real auth, and the counter does not
// cross instances in a multi-instance deployment (acceptable for what this
// is guarding — see the file header).
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

interface AttemptBucket {
  count: number;
  resetAt: number;
}
const failedAttempts = new Map<string, AttemptBucket>();

function currentBucket(clientKey: string): AttemptBucket | undefined {
  const bucket = failedAttempts.get(clientKey);
  if (bucket && Date.now() > bucket.resetAt) {
    failedAttempts.delete(clientKey);
    return undefined;
  }
  return bucket;
}

export function isLockedOut(clientKey: string): boolean {
  return (currentBucket(clientKey)?.count ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export function recordFailedLogin(clientKey: string): void {
  const bucket = currentBucket(clientKey);
  if (bucket) {
    bucket.count += 1;
  } else {
    failedAttempts.set(clientKey, { count: 1, resetAt: Date.now() + LOCKOUT_WINDOW_MS });
  }
}

export function clearFailedLogins(clientKey: string): void {
  failedAttempts.delete(clientKey);
}
