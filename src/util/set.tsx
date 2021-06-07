export function addAll<T>(self: Set<T>, other: Iterable<T>): void {
  for (const el of other) self.add(el);
}

export function equals(
  a: Set<unknown> | undefined,
  b: Set<unknown> | undefined
) {
  if (!a || !b || a.size !== b.size) return false;
  for (const el of a) {
    if (!b.has(el)) return false;
  }
  return true;
}

export function* diff<T>(a: Set<T>, b: Set<unknown>): Iterable<T> {
  for (const el of a) {
    if (!b.has(el)) yield el;
  }
}
