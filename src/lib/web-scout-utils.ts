import { isIP } from "node:net";

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
      || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.")
      || normalized.startsWith("::ffff:169.254.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}
