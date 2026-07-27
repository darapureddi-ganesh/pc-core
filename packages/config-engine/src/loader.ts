import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import type { Product } from "./types.js";

export interface LoadedProduct {
  product: Product;
  /** content hash — this is what a `product_version` row would pin. */
  contentHash: string;
}

/**
 * Load a product definition from YAML and content-hash it. In the real system
 * the hash is stored on the policy period so an in-flight policy is always
 * priced against the exact metadata it was quoted on, even after the product
 * is revised.
 */
export function loadProduct(filePath: string): LoadedProduct {
  const raw = readFileSync(filePath, "utf8");
  const product = parse(raw) as Product;
  const contentHash = createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 16);
  return { product, contentHash };
}
