export function addAll<T>(self: Set<T>, other: Set<T>): void {
  for (const el of other) self.add(el);
}
