export * from "@pschiffmann/std/map";

/**
 * Returns `self.get(key1).get(key2).get(key3)`, or `fallback` if any key
 * doesn't exist.
 */
export function deepGetOrFallback<K1, K2, K3, V>(
  self: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
  key3: K3,
  fallback: V
): V {
  const nested1 = self.get(key1);
  if (nested1) {
    const nested2 = nested1.get(key2);
    if (nested2?.has(key3)) {
      return nested2!.get(key3)!;
    }
  }
  return fallback;
}

/**
 * Performs `self.get(key1).get(key2).set(key3, value)`, but also creates nested
 * maps `key1` and `key2` if they don't exist.
 */
export function deepSet<K1, K2, K3, V>(
  self: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
  key3: K3,
  value: V
): void {
  let nested1 = self.get(key1);
  if (!nested1) self.set(key1, (nested1 = new Map()));
  let nested2 = nested1.get(key2);
  if (!nested2) nested1.set(key2, (nested2 = new Map()));
  nested2.set(key3, value);
}

/**
 * Performs `self.get(key1).get(key2).delete(key3)`, but also deletes the nested
 * maps `key2` and `key1` if they are empty afterwards.
 */
export function deepDelete<K1, K2, K3>(
  self: Map<K1, Map<K2, Map<K3, any>>>,
  key1: K1,
  key2: K2,
  key3: K3
): void {
  const nested1 = self.get(key1)!;
  const nested2 = nested1.get(key2)!;
  nested2.delete(key3);
  if (!nested2.size) {
    nested1.delete(key2);
    if (!nested1.size) {
      self.delete(key1);
    }
  }
}
