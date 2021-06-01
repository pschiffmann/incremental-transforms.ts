import type { Node } from "../core";
import { TransformNode } from "../core";

export interface IncrementalMap<K, V> extends Node {
  has(key: K): boolean;
  get(key: K): V | undefined;
  readonly size: number;

  entries(): Iterable<[K, V]>;
  keys(): Iterable<K>;
  values(): Iterable<V>;
  [Symbol.iterator](): IterableIterator<[K, V]>;
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
  return patch.updated.size !== 0 || patch.deleted.size !== 0 ? patch : null;
}

export abstract class IncrementalMapBase<K, V, D>
  extends TransformNode<D, IncrementalMapPatch<K, V>, K>
  implements IncrementalMap<K, V> {
  #entries = new Map<K, V>();

  get size() {
    return this.#entries.size;
  }

  has(key: K) {
    return this.#entries.has(key);
  }

  get(key: K) {
    return this.#entries.get(key);
  }

  entries() {
    return this.#entries.entries();
  }

  keys() {
    return this.#entries.keys();
  }

  values() {
    return this.#entries.values();
  }

  [Symbol.iterator]() {
    return this.#entries.entries();
  }

  _commit(patch: IncrementalMapPatch<K, V>) {
    for (const [k, v] of patch.updated) {
      this.#entries.set(k, v);
    }
    for (const k of patch.deleted) {
      this.#entries.delete(k);
    }
  }

  _clear(): void {
    this.#entries.clear();
  }
}
