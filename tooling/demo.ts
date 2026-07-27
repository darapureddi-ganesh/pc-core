/**
 * `pnpm demo` — a end-to-end walk through the two pieces that matter:
 * the config-driven rating engine and the effective-dated timeline.
 */
import { productFilePath, PRIVATE_CAR_2026_1 } from "@pc-core/products";
import { loadProduct, quote, type QuoteInput } from "@pc-core/config-engine";
import {
  buildTimeline,
  snapshotAsOf,
  type Issue,
  type Transaction,
} from "@pc-core/domain";

const line = (s = "") => console.log(s);
const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

// ── 1. Rate a risk, entirely from metadata ────────────────────────────────
const { product, contentHash } = loadProduct(
  productFilePath(PRIVATE_CAR_2026_1),
);

line(`Product: ${product.product} @ ${product.version}  (hash ${contentHash})`);
line("─".repeat(60));

const input: QuoteInput = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: ["ZERO_DEP"],
  coverages: { tpSelected: true },
};

const result = quote(product, input);
line("QUOTE — 2024 hatchback, IDV 6,00,000, 25% NCB, Zero-Dep add-on");
for (const [k, v] of Object.entries(result.breakdown)) {
  line(`  ${k.padEnd(10)} ${inr(v).padStart(16)}`);
}
line(`  ${"TOTAL".padEnd(10)} ${inr(result.total).padStart(16)}`);
if (result.referrals.length) line(`  referrals: ${result.referrals.map((r) => r.id).join(", ")}`);

// ── 2. Reconstruct a policy timeline across backdated changes ──────────────
line();
line("TIMELINE — issue, add a driver, then a BACKDATED sum-insured raise");
line("─".repeat(60));

interface MotorState { drivers: string[]; idv: number }

const issue: Issue<MotorState> = {
  term: { from: "2026-01-01", to: "2027-01-01" },
  recordedAt: "2026-01-01T00:00:00Z",
  base: { drivers: ["A"], idv: 600_000 },
};
const txns: Transaction<MotorState>[] = [
  {
    txnType: "ENDORSE",
    effectiveFrom: "2026-04-01",
    recordedAt: "2026-04-01T10:00:00Z",
    apply: (s) => ({ ...s, drivers: [...s.drivers, "B"] }),
  },
  {
    txnType: "ENDORSE",
    effectiveFrom: "2026-02-01",
    recordedAt: "2026-06-01T10:00:00Z", // recorded long after it takes effect
    apply: (s) => ({ ...s, idv: 700_000 }),
  },
];

const timeline = buildTimeline(issue, txns);
for (const date of ["2026-01-15", "2026-03-01", "2026-05-01"]) {
  const s = snapshotAsOf(timeline, date);
  line(`  as-of ${date}:  drivers=[${s?.drivers.join(",")}]  idv=${inr(s?.idv ?? 0)}`);
}
line();
line("Same query, but as we KNEW it on 2026-05-01 (before the backdated raise):");
const asKnownInMay = buildTimeline(issue, txns, "2026-05-01T00:00:00Z");
const s = snapshotAsOf(asKnownInMay, "2026-03-01");
line(`  as-of 2026-03-01:  drivers=[${s?.drivers.join(",")}]  idv=${inr(s?.idv ?? 0)}`);
