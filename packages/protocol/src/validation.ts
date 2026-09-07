function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new TypeError("Expected an object.");
  return value;
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError("Unexpected field.");
}
export function uint(value: unknown, max = 0xffffffff): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new TypeError("Invalid integer.");
  return value;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Expected a boolean.");
  return value;
}
export function text(value: unknown, max: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length > max || (pattern && !pattern.test(value))) throw new TypeError("Invalid text.");
  return value;
}
export function choice<const T extends string | number>(value: unknown, values: readonly T[]): T {
  for (const candidate of values) if (value === candidate) return candidate;
  throw new TypeError("Unknown choice.");
}
export function array<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new TypeError("Invalid list.");
  return value.map(parse);
}
export const id = (value: unknown): string => text(value, 36, /^[a-zA-Z0-9_-]{1,36}$/);
export function nullableId(value: unknown): string | null { return value === null ? null : id(value); }
export const byteLength = (value: string): number => new TextEncoder().encode(value).length;
export function json(value: string, max: number): unknown {
  if (byteLength(value) > max) throw new TypeError("Message exceeds the byte limit.");
  return JSON.parse(value);
}
