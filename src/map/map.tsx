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

type MappedIncrementalMapCallback<K, IV, OV, C extends Context> = (
  key: K,
  value: IV,
  context: UnpackContext<C>
) => OV;

type Dependencies<K, IV, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, IV>;
};

export function map<K, IV, OV, C extends Context>(
  self: IncrementalMap<K, IV>,
  callback: MappedIncrementalMapCallback<K, IV, OV, C>,
  context?: C
): MappedIncrementalMap<K, IV, OV, C> {
  const result = new MappedIncrementalMap(self, callback, context);
  result.connect();
  return result;
}

export class MappedIncrementalMap<
  K,
  IV,
  OV,
  C extends Context
> extends IncrementalMapBase<K, OV, Dependencies<K, IV, C>> {
  constructor(
    self: IncrementalMap<K, IV>,
    callback: MappedIncrementalMapCallback<K, IV, OV, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: MappedIncrementalMapCallback<K, IV, OV, C>;

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
      const value = hookRenderer(k, () => this.#callback(k, v, ctx));
      patch.updated.set(k, value);
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
      const value = hookRenderer(k, () => this.#callback(k, v, ctx));
      if (!this.has(k) || !Object.is(value, this.get(k))) {
        patch.updated.set(k, value);
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
