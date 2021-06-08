import type { HookRenderer } from "../core";
import { buildContext, Context, UnpackContext } from "../value";
import {
  createPatch,
  getDirtyEntries,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
  simplifyPatch,
} from "./base";

type FilteredIncrementalMapCallback<K, V, C extends Context> = (
  key: K,
  value: V,
  context: UnpackContext<C>
) => boolean;

type Dependencies<K, V, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, V>;
};

export function filter<K, V, C extends Context>(
  self: IncrementalMap<K, V>,
  callback: FilteredIncrementalMapCallback<K, V, C>,
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
    callback: FilteredIncrementalMapCallback<K, V, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: FilteredIncrementalMapCallback<K, V, C>;

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

    for (const [k, v] of getDirtyEntries(self, selfPatch, self.keys())) {
      const result = hookRenderer(k, () => this.#callback(k, v, ctx));
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

    const contextChanged = patches.size !== Number(patches.has("self"));
    for (const [k, v] of getDirtyEntries(
      self,
      selfPatch,
      contextChanged ? self.keys() : dirtyKeys
    )) {
      const result = hookRenderer(k, () => this.#callback(k, v, ctx));
      if (result !== this.has(k)) {
        result ? patch.updated.set(k, v) : patch.deleted.add(k);
      }
    }
    if (selfPatch) {
      for (const k of selfPatch.deleted) {
        hookRenderer(k);
        patch.deleted.add(k);
      }
    }

    return simplifyPatch(patch);
  }
}
