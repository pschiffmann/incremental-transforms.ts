import type { HookRenderer } from "../core";
import { buildContext, Context, UnpackContext } from "../value";
import {
  getDirtyEntries,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
  simplifyPatch,
} from "./base";

type MappedEntriesIncrementalMapCallback<IK, IV, OK, OV, C extends Context> = (
  key: IK,
  value: IV,
  context: UnpackContext<C>
) => [OK, OV];

type Dependencies<IK, IV, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<IK, IV>;
};

interface MappedEntriesIncrementalMapPatch<IK, OK, V>
  extends IncrementalMapPatch<OK, V> {
  readonly keyMapping: Map<IK, OK>;
}

export function mapEntries<IK, IV, OK, OV, C extends Context>(
  self: IncrementalMap<IK, IV>,
  callback: MappedEntriesIncrementalMapCallback<IK, IV, OK, OV, C>,
  context?: C
): IncrementalMap<OK, OV> {
  const result = new MappedEntriesIncrementalMap(self, callback, context);
  result.connect();
  return result;
}

export class MappedEntriesIncrementalMap<
  IK,
  IV,
  OK,
  OV,
  C extends Context
> extends IncrementalMapBase<OK, OV, Dependencies<IK, IV, C>, IK> {
  constructor(
    self: IncrementalMap<IK, IV>,
    callback: MappedEntriesIncrementalMapCallback<IK, IV, OK, OV, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: MappedEntriesIncrementalMapCallback<IK, IV, OK, OV, C>;
  #keyMapping = new Map<IK, OK>();

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<IK>
  ): IncrementalMapPatch<OK, OV> | null {
    const patch = createPatch<IK, OK, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    for (const [ik, iv] of getDirtyEntries(self, selfPatch, self.keys())) {
      const [ok, ov] = hookRenderer(ik, () => this.#callback(ik, iv, ctx));

      patch.updated.set(ok, ov);
      if (patch.keyMapping.has(ik)) {
        throw new Error("Key collision detected");
      }
      patch.keyMapping.set(ik, ok);
    }

    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<IK>,
    hookRenderer: HookRenderer<IK>
  ): IncrementalMapPatch<OK, OV> | null {
    const patch = createPatch<IK, OK, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    const contextChanged = patches.size !== Number(patches.has("self"));
    for (const [ik, iv] of getDirtyEntries(
      self,
      selfPatch,
      contextChanged ? self.keys() : dirtyKeys
    )) {
      const [ok, ov] = hookRenderer(ik, () => this.#callback(ik, iv, ctx));
      if (!this.has(ok) || !Object.is(ov, this.get(ok))) {
        patch.updated.set(ok, ov);
      }
    }
    if (selfPatch) {
      for (const ik of selfPatch.deleted) {
        hookRenderer(ik);
        // patch.deleted.add(ik);
      }
    }

    return simplifyPatch(patch);
  }

  _clear(): void {
    super._clear();
    this.#keyMapping.clear();
  }

  _commit(patch: MappedEntriesIncrementalMapPatch<IK, OK, OV>): void {
    super._commit(patch);
  }
}

function createPatch<IK, OK, V>(): MappedEntriesIncrementalMapPatch<IK, OK, V> {
  return { updated: new Map(), deleted: new Set(), keyMapping: new Map() };
}
