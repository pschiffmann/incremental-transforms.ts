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

/**
 * Helper function that can be used when implementing `_initialize()` and
 * `_render()` in classes that transform a single IncrementalMap as input.
 *
 * Yields entries for all keys in `patch.updated` and `dirtyKeys` except for
 * those in `patch.deleted`. Values from `patch.updated` are prioritized over
 * values from `input`.
 *
 * `dirtyKeys()` is a list of keys from `input` that should be re-rendered.
 * `_initialize()` should pass `input.keys()` because all keys need to be
 * rendered. `_render()` should pass its own `dirtyKeys` argument, or
 * `input.keys()` if a context value changed.
 *
 * Notice: This function doesn't yield `patch.deleted` keys. `_render()`
 * implementations must read deleted keys from the patch directly.
 */
export function* getDirtyEntries<K, V>(
  input: IncrementalMap<K, V>,
  patch: IncrementalMapPatch<K, V> | undefined,
  dirtyKeys: Iterable<K>
): Iterable<[K, V]> {
  if (patch) {
    for (const entry of patch.updated) {
      yield entry;
    }
  }
  for (const k of dirtyKeys) {
    if (!patch || (!patch.updated.has(k) && !patch.deleted.has(k))) {
      yield [k, input.get(k)!];
    }
  }
}

export abstract class IncrementalMapBase<K, V, D, HK = K>
  extends TransformNode<D, IncrementalMapPatch<K, V>, HK>
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
