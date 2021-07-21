import { SourceNode } from "../core";
import * as $Set from "../util/set";
import type { IncrementalMap, IncrementalMapPatch } from "./base";
import { createPatch, simplifyPatch } from "./base";

export function mutable<K, V>(
  entries?: Iterable<[K, V]>
): MutableIncrementalMap<K, V> {
  return new MutableIncrementalMap(entries);
}

export class MutableIncrementalMap<K, V>
  extends SourceNode<IncrementalMapPatch<K, V>>
  implements IncrementalMap<K, V> {
  constructor(entries?: Iterable<[K, V]>) {
    super();
    if (entries) {
      for (const [k, v] of entries) {
        this.#entries.set(k, v);
      }
    }
  }

  #entries = new Map<K, V>();

  get size() {
    return this.#entries.size;
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  get(key: K): V | undefined {
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

  set(key: K, value: V): void {
    this._setState((patch) => {
      patch ??= createPatch();
      Object.is(this.get(key), value)
        ? patch.updated.delete(key)
        : patch.updated.set(key, value);
      patch.deleted.delete(key);
      return simplifyPatch(patch);
    });
  }

  delete(key: K): void {
    this._setState((patch) => {
      patch ??= createPatch();
      patch.updated.delete(key);
      if (this.has(key)) patch.deleted.add(key);
      return simplifyPatch(patch);
    });
  }

  clear(): void {
    this._setState(() => {
      const patch = createPatch<K, V>();
      $Set.addAll(patch.deleted, this.keys());
      return simplifyPatch(patch);
    });
  }

  _commit(patch: IncrementalMapPatch<K, V>): void {
    for (const [key, value] of patch.updated) {
      this.#entries.set(key, value);
    }
    for (const key of patch.deleted) {
      this.#entries.delete(key);
    }
  }
}
