import type { HookRenderer } from "../core";
import { buildContext, Context, UnpackContext } from "../opaque-value";
import {
  createPatch,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
  simplifyPatch,
} from "./base";

// Should the callback signature be `(key, value, ctx) => boolean`?
// Or maybe implement `filterEntries()`, `mapEntries()` that use both key and
// value?
type FilteredIncrementalMapCallback<V, C extends Context> = (
  value: V,
  context: UnpackContext<C>
) => boolean;

type Dependencies<K, V, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, V>;
};

export function filter<K, V, C extends Context>(
  self: IncrementalMap<K, V>,
  callback: FilteredIncrementalMapCallback<V, C>,
  context?: C
): FilteredIncrementalMap<K, V, C> {
  const result = new FilteredIncrementalMap(self, callback, context);
  result.connect();
  return result;
}

export class FilteredIncrementalMap<
  K,
  V,
  C extends Context
> extends IncrementalMapBase<K, V, Dependencies<K, V, C>> {
  constructor(
    self: IncrementalMap<K, V>,
    callback: FilteredIncrementalMapCallback<V, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: FilteredIncrementalMapCallback<V, C>;

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, V> | null {
    const patch = createPatch<K, V>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, V>
      | undefined;

    if (selfPatch) {
      for (const [k, v] of selfPatch.updated) {
        const result = hookRenderer(k, () => this.#callback(v, ctx));
        if (result) patch.updated.set(k, v);
      }
    }
    for (const [k, v] of self) {
      if (selfPatch && (selfPatch.updated.has(k) || selfPatch.deleted.has(k))) {
        continue;
      }
      const result = hookRenderer(k, () => this.#callback(v, ctx));
      if (result) patch.updated.set(k, v);
    }
    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, V> | null {
    const patch = createPatch<K, V>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, V>
      | undefined;

    if (selfPatch) {
      for (const [k, v] of selfPatch.updated) {
        const result = hookRenderer(k, () => this.#callback(v, ctx));
        if (result !== this.has(k)) {
          result ? patch.updated.set(k, v) : patch.deleted.add(k);
        }
      }
      for (const k of selfPatch.deleted) {
        hookRenderer(k);
        patch.deleted.add(k);
      }
    }

    // If a context value changed, all keys must be re-rendered
    const contextChanged = patches.has("self")
      ? patches.size > 1
      : patches.size > 0;
    for (const k of contextChanged ? this.keys() : dirtyKeys) {
      if (selfPatch && (selfPatch.updated.has(k) || selfPatch.deleted.has(k))) {
        continue;
      }
      const result = hookRenderer(k, () => this.#callback(self.get(k)!, ctx));
      if (result !== this.has(k)) {
        result ? patch.updated.set(k, self.get(k)!) : patch.deleted.add(k);
      }
    }
    return simplifyPatch(patch);
  }
}
