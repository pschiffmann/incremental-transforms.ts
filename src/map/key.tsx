import { IncrementalValueBase, IncrementalValuePatch } from "../value/index.js";
import { IncrementalMap, IncrementalMapPatch } from "./base.js";

interface Dependencies<K, V> {
  readonly self: IncrementalMap<K, V>;
}

export function key<K, V, F>(
  self: IncrementalMap<K, V>,
  key: K,
  fallback: F
): IncrementalMapKey<K, V, F> {
  const result = new IncrementalMapKey(self, key, fallback);
  result.connect();
  return result;
}

export class IncrementalMapKey<K, V, F> extends IncrementalValueBase<
  V | F,
  Dependencies<K, V>
> {
  constructor(self: IncrementalMap<K, V>, key: K, fallback: F) {
    super({ self });
    this.#key = key;
    this.#fallback = fallback;
  }

  #key: K;
  #fallback: F;

  _initialize(patches: Map<string, unknown>): IncrementalValuePatch<V | F> {
    const { self } = this.dependencies;
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, V>
      | undefined;
    let value: V | F = this.#fallback;
    if (selfPatch?.updated.has(this.#key)) {
      value = selfPatch.updated.get(this.#key)!;
    }
    if (self.has(this.#key) && !selfPatch?.deleted.has(this.#key)) {
      value = self.get(this.#key)!;
    }
    return { value };
  }

  _render(patches: Map<string, unknown>): IncrementalValuePatch<V | F> | null {
    const selfPatch = patches.get("self") as IncrementalMapPatch<K, V>;
    if (selfPatch.updated.has(this.#key)) {
      return { value: selfPatch.updated.get(this.#key)! };
    }
    if (selfPatch.deleted.has(this.#key)) {
      return { value: this.#fallback };
    }
    return null;
  }
}
