import type { HookRenderer } from "../core";
import { buildContext, Context, UnpackContext } from "../opaque-value";
import {
  createPatch,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
  simplifyPatch,
} from "./base";

type MappedIncrementalMapCallback<IV, OV, C extends Context> = (
  value: IV,
  context: UnpackContext<C>
) => OV;

type Dependencies<K, IV, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, IV>;
};

export function map<K, IV, OV, C extends Context>(
  self: IncrementalMap<K, IV>,
  callback: MappedIncrementalMapCallback<IV, OV, C>,
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
    callback: MappedIncrementalMapCallback<IV, OV, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: MappedIncrementalMapCallback<IV, OV, C>;

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> {
    const patch = createPatch<K, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<K, IV>
      | undefined;
    if (selfPatch) {
      for (const [k, v] of selfPatch.updated) {
        const value = hookRenderer(k, () => this.#callback(v, ctx));
        patch.updated.set(k, value);
      }
    }
    for (const [k, v] of self) {
      if (selfPatch && (selfPatch.updated.has(k) || selfPatch.deleted.has(k))) {
        continue;
      }
      const value = hookRenderer(k, () => this.#callback(v, ctx));
      patch.updated.set(k, value);
    }
    return patch;
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
    if (selfPatch) {
      for (const [k, v] of selfPatch.updated) {
        const value = hookRenderer(k, () => this.#callback(v, ctx));
        if (!this.has(k) || !Object.is(value, this.get(k))) {
          patch.updated.set(k, value);
        }
      }
      for (const k of selfPatch.deleted) {
        hookRenderer(k);
        patch.deleted.add(k);
      }
    }
    for (const k of dirtyKeys) {
      if (selfPatch && (selfPatch.updated.has(k) || selfPatch.deleted.has(k))) {
        continue;
      }
      const value = hookRenderer(k, () => this.#callback(self.get(k)!, ctx));
      if (!Object.is(value, this.get(k))) {
        patch.updated.set(k, value);
      }
    }
    return simplifyPatch(patch);
  }
}
