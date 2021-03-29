/**
 * Returns `self.get(key)` if it exists, else adds the result of `ifAbsent` to
 * `self` and returns it.
 */
export function putIfAbsent(self, key, ifAbsent) {
  if (self.has(key)) return self.get(key);
  const result = ifAbsent();
  self.set(key, result);
  return result;
}
/**
 * Returns `self.get(key1).get(key2).get(key3)`, or `fallback` if any key
 * doesn't exist.
 */
export function deepGetOrFallback(self, key1, key2, key3, fallback) {
  const nested1 = self.get(key1);
  if (nested1) {
    const nested2 = nested1.get(key2);
    if (nested2?.has(key3)) {
      return nested2.get(key3);
    }
  }
  return fallback;
}
/**
 * Performs `self.get(key1).get(key2).set(key3, value)`, but also creates nested
 * maps `key1` and `key2` if they don't exist.
 */
export function deepSet(self, key1, key2, key3, value) {
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
export function deepDelete(self, key1, key2, key3) {
  const nested1 = self.get(key1);
  const nested2 = nested1.get(key2);
  nested2.delete(key3);
  if (!nested2.size) {
    nested1.delete(key2);
    if (!nested1.size) {
      self.delete(key1);
    }
  }
}
