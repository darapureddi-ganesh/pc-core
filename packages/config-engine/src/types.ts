/**
 * The shape of a product definition — the metadata the engine interprets.
 *
 * Nothing here is motor-specific in code: `PRIVATE_CAR` is just one YAML file
 * that happens to match this shape. A two-wheeler or a fleet product is a
 * different file resolved by the same loader and priced by the same engine.
 */

export interface Band {
  label: string;
  /** upper bound of the band; `null` means open-ended (the top band) */
  max: number | null;
}

export interface AddOn {
  name: string;
  /** rate as a fraction of IDV */
  rate: number;
  /** optional json-logic eligibility predicate */
  eligible?: unknown;
}

export interface ProductTables {
  ccBands: Band[];
  ageBands: Band[];
  /** ncb % (as string key) -> discount fraction, e.g. "25" -> 0.25 */
  ncbScale: Record<string, number>;
  /** od_base[zone][ccBand][ageBand] -> rate fraction of IDV */
  od_base: Record<string, Record<string, Record<string, number>>>;
  /** tp_tariff[ccBand] -> flat amount */
  tp_tariff: Record<string, number>;
  /** flat PA (owner-driver) premium */
  paRate: number;
}

export interface RatingStep {
  name: string;
  /** arithmetic expression over prior step names + the derived context */
  expr: string;
}

export interface RatingModel {
  gstRate: number;
  algorithm: RatingStep[];
}

export interface Rule {
  id: string;
  action: "refer" | "error";
  message: string;
  /** json-logic predicate evaluated against the rule context */
  when: unknown;
}

export interface Product {
  product: string;
  version: string;
  currency: string;
  coverages: {
    OD: { name: string; mandatory: boolean };
    TP: { name: string; mandatory: boolean };
    PA_OWNER: { name: string; mandatory: boolean; sumInsured: number };
    addOns: Record<string, AddOn>;
  };
  tables: ProductTables;
  rating: RatingModel;
  rules: Rule[];
}

/** What a channel sends in to get a quote. */
export interface QuoteInput {
  vehicle: {
    cc: number;
    idv: number;
    rtoZone: string;
    /** age of the vehicle in whole years */
    age: number;
  };
  policy: { ncb: number };
  selectedAddOns: string[];
  coverages: { tpSelected: boolean };
}

export interface RatingResult {
  productCode: string;
  productVersion: string;
  breakdown: Record<string, number>;
  total: number;
  referrals: Array<{ id: string; message: string }>;
  errors: Array<{ id: string; message: string }>;
}
