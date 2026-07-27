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
};

export default nextConfig;
