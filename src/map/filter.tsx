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

type IncrementalMapTypePredicate<K, IV, OV extends IV, C extends Context> = (
  key: K,
  value: IV,
  context: UnpackContext<C>
) => value is OV;

type IncrementalMapFilter<K, V, C extends Context> = (
  key: K,
  value: V,
  context: UnpackContext<C>
) => boolean;

type Dependencies<K, V, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, V>;
};

/**
 * If the filter callback is a [type predicate][1], the value type of the
 * resulting map will be of the type guarded by the type predicate. See this
 * example for details:
 *
 * ```ts
 * const a = $IncrementalMap.mutable<string, "a" | "b" | "c">();
 * const b = $IncrementalMap.filter(a, function(k, v): v is "a" | "b" {
 *   return v === "a" || "v" === "b";
 * });
 * // `b` will be of type IncrementalMap<string, "a" | "b">
 * ```
 *
 * [1]: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
 */
export function filter<K, IV, OV extends IV, C extends Context>(
  self: IncrementalMap<K, IV>,
  callback: IncrementalMapTypePredicate<K, IV, OV, C>,
  context?: C
): IncrementalMap<K, OV>;
export function filter<K, V, C extends Context>(
  self: IncrementalMap<K, V>,
  callback: IncrementalMapFilter<K, V, C>,
  context?: C
): IncrementalMap<K, V>;
export function filter(self: any, callback: any, context?: any) {
  const result = new FilteredIncrementalMap(self, callback, context);
  result.connect();
  return result;
}

export class FilteredIncrementalMap<
  K,
  IV,
  OV extends IV,
  C extends Context
> extends IncrementalMapBase<K, OV, Dependencies<K, IV, C>> {
  constructor(
    self: IncrementalMap<K, IV>,
    callback: IncrementalMapTypePredicate<K, IV, OV, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: IncrementalMapTypePredicate<K, IV, OV, C>;

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {
    const patch = createPatch<K, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, IV>
      | undefined;

    for (const [k, v] of getDirtyEntries(self, selfPatch, self.keys())) {
      const result = hookRenderer(k, () => this.#callback(k, v, ctx));
      if (result) patch.updated.set(k, v as OV);
    }

    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {
    const patch = createPatch<K, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, IV>
      | undefined;

    const contextChanged = patches.size !== Number(patches.has("self"));
    for (const [k, v] of getDirtyEntries(
      self,
      selfPatch,
      contextChanged ? self.keys() : dirtyKeys
    )) {
      const result = hookRenderer(k, () => this.#callback(k, v, ctx));
      if (result !== this.has(k)) {
        result ? patch.updated.set(k, v as OV) : patch.deleted.add(k);
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
