/**
 * Returns `self.get(key)` if it exists, else adds the result of `ifAbsent` to
 * `self` and returns it.
 */
export declare function putIfAbsent<K, V>(
  self: Map<K, V>,
  key: K,
  ifAbsent: () => V
): V;
/**
 * Returns `self.get(key1).get(key2).get(key3)`, or `fallback` if any key
 * doesn't exist.
 */
export declare function deepGetOrFallback<K1, K2, K3, V>(
  self: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
  key3: K3,
  fallback: V
): V;
/**
 * Performs `self.get(key1).get(key2).set(key3, value)`, but also creates nested
 * maps `key1` and `key2` if they don't exist.
 */
export declare function deepSet<K1, K2, K3, V>(
  self: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
  key3: K3,
  value: V
): void;
/**
 * Performs `self.get(key1).get(key2).delete(key3)`, but also deletes the nested
 * maps `key2` and `key1` if they are empty afterwards.
 */
export declare function deepDelete<K1, K2, K3>(
  self: Map<K1, Map<K2, Map<K3, any>>>,
  key1: K1,
  key2: K2,
  key3: K3
): void;
