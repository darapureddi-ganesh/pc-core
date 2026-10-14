import { fileURLToPath } from "node:url";
import path from "node:path";

// The monorepo root — keeps Next's file tracing scoped here rather than $HOME
// (which has an unrelated lockfile).
const monorepoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // The agent portal talks to the pc-core API over HTTP; nothing to transpile.

  // Baseline headers on every portal response. No CSP here deliberately —
  // Next's own hydration script needs 'unsafe-inline'/a nonce to allow it
  // through, and getting that wrong (vs. just not shipping a CSP) is the
  // riskier failure mode for a one-pass hardening change; these are
  // otherwise safe and catch the common cases (MIME-sniffing, clickjacking
  // via framing the login/portal). Referrer-Policy is `strict-origin-when-
  // cross-origin`, not `no-referrer`: Next's Server Actions check the
  // Referer header server-side as their own built-in CSRF defense, so
  // suppressing it entirely breaks every form submission in this app with
  // an opaque "Invalid URL" 500 — found by hitting exactly that while
  // verifying this change. `strict-origin-when-cross-origin` still strips
  // the referrer down to just the origin for cross-origin requests (the
  // same default modern browsers already apply) while keeping the
  // same-origin Referer Next's own action handler needs.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
