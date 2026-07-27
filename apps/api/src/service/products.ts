import { loadProduct, type LoadedProduct } from "@pc-core/config-engine";
import { productFilePath, PRIVATE_CAR_2026_1 } from "@pc-core/products";

/** productCode[@version] -> YAML file. One line today; a table or DB later. */
const REGISTRY: Record<string, string> = {
  "PRIVATE_CAR@2026.1": PRIVATE_CAR_2026_1,
  PRIVATE_CAR: PRIVATE_CAR_2026_1,
};

export function resolveProduct(
  productCode: string,
  version?: string,
): LoadedProduct {
  const key = version ? `${productCode}@${version}` : productCode;
  const file = REGISTRY[key] ?? REGISTRY[productCode];
  if (!file) throw new Error(`unknown product ${key}`);
  return loadProduct(productFilePath(file));
}
