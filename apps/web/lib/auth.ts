// Demo-grade portal auth: one shared password gates the whole app behind an
// HMAC-signed session cookie. This is NOT tenant-level authorization — the API
// itself already authenticates per-connector via Bearer apiKey (see
// apps/api/src/tenants.ts); this is just a login screen so the portal isn't
// wide open to anyone with the URL. Runs on both the Edge (middleware) and
// Node.js (server actions) runtimes, so it uses Web Crypto rather than
// node:crypto — both expose a global `crypto.subtle`.

export const SESSION_COOKIE = "pc_portal_session";
const SESSION_VALUE = "authenticated";

function secret(): string {
  return process.env.PORTAL_AUTH_SECRET ?? "pc-core-demo-secret-change-me";
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
  return sig === (await hmac(value));
}

export function checkPassword(password: string): boolean {
  return password.length > 0 && password === (process.env.PORTAL_PASSWORD ?? "pc-core-demo");
}
