import { fileURLToPath } from "node:url";

/** Absolute path to a product YAML shipped in this package. */
export function productFilePath(fileName: string): string {
  return fileURLToPath(new URL(`./${fileName}`, import.meta.url));
}

export const PRIVATE_CAR_2026_1 = "private_car.2026.1.yaml";
