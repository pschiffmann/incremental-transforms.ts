export interface IncrementalMap<K, V> {
  has(key: K): boolean;
  get(key: K): V | undefined;

  entries(): Iterable<[K, V]>;
  keys(): Iterable<K>;
  values(): Iterable<V>;
}

export interface IncrementalMapPatch<K, V> {
  readonly updated: Map<K, V>;
  readonly deleted: Set<K>;
}

export function createPatch<K, V>(): IncrementalMapPatch<K, V> {
  return { updated: new Map(), deleted: new Set() };
}

export function simplifyPatch<K, V>(
  patch: IncrementalMapPatch<K, V>
): IncrementalMapPatch<K, V> | null {
  return patch.updated.size !== 0 || patch.updated.size !== 0 ? patch : null;
}

export class IncrementalMapBase<K, V>
  extends TransformNode
  implements IncrementalMap<K, V> {
  #entries = new Map<K, V>();
}
