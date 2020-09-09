export function putIfAbsent<K, V>(
  self: Map<K, V>,
  key: K,
  ifAbsent: () => V
): V {
  if (self.has(key)) return self.get(key);
  const result = ifAbsent();
  self.set(key, result);
  return result;
}
