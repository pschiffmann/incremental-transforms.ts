import type { HookRenderer } from "../core";
import * as $Set from "../util/set";
import { buildContext, Context, UnpackContext } from "../value";
import {
  getDirtyEntries,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
} from "./base";

type ExpandedIncrementalMapCallback<IK, IV, OK, OV, C extends Context> = (
  key: IK,
  value: IV,
  context: UnpackContext<C>
) => Iterable<[OK, OV]>;

type Dependencies<K, V, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, V>;
};

export function expand<IK, IV, OK, OV, C extends Context>(
  self: IncrementalMap<IK, IV>,
  callback: ExpandedIncrementalMapCallback<IK, IV, OK, OV, C>,
  context?: C
): IncrementalMap<OK, OV> {
  const result = new ExpandedIncrementalMap(self, callback, context);
  result.connect();
  return result;
}

export class ExpandedIncrementalMap<
  IK,
  IV,
  OK,
  OV,
  C extends Context
> extends IncrementalMapBase<OK, OV, Dependencies<IK, IV, C>, IK> {
  constructor(
    self: IncrementalMap<IK, IV>,
    callback: ExpandedIncrementalMapCallback<IK, IV, OK, OV, C>,
    context?: C
  ) {
    super({ ...context, self } as any);
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    this.#callback = callback;
  }

  #callback: ExpandedIncrementalMapCallback<IK, IV, OK, OV, C>;

  /**
   * For each key in `dependencies.self`, stores the keys that were returned by
   * the last call to `#callback`.
   */
  #expandedKeys = new Map<IK, Set<OK>>();

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<IK>
  ): ExpandedIncrementalMapPatch<IK, OK, OV> | null {
    const patch = createPatch<IK, OK, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    for (const [ik, iv] of getDirtyEntries(self, selfPatch, self.keys())) {
      const generatedKeys = new Set<OK>();
      patch.expandedKeys.set(ik, generatedKeys);
      const entries = hookRenderer(ik, () => this.#callback(ik, iv, ctx));
      for (const [ok, ov] of entries) {
        if (patch.updated.has(ok)) throw keyCollisionError();
        patch.updated.set(ok, ov);
        generatedKeys.add(ok);
      }
    }

    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<IK>,
    hookRenderer: HookRenderer<IK>
  ): ExpandedIncrementalMapPatch<IK, OK, OV> | null {
    const patch = createPatch<IK, OK, OV>();
    const { self, ...context } = this.dependencies;
    const ctx = buildContext((context as unknown) as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    // Contains out keys that were present in the previous callback result of an
    // in key, but are absent in the new result.
    const releasedKeys = new Set<OK>();
    // Contains keys that are new in the callback result for an in key since the
    // last render. Needs to be tracked separately from `patch.updated()`,
    // because in key `i1` could release out key `o1` with value `v1`, and in
    // keys `i2` and `i3` could both claim out key `o1` with the same value
    // `v1`. In this case, `o1` wouldn't be present in `patch.updated` or
    // `patch.deleted`, but there is still a key collision between `i2` and
    // `i3`.
    const claimedKeys = new Set<OK>();

    const contextChanged = patches.size !== Number(patches.has("self"));
    for (const [ik, iv] of getDirtyEntries(
      self,
      selfPatch,
      contextChanged ? self.keys() : dirtyKeys
    )) {
      const oldExpandedKeys = this.#expandedKeys.get(ik);
      const newExpandedKeys = new Set<OK>();
      const entries = hookRenderer(ik, () => this.#callback(ik, iv, ctx));
      for (const [ok, ov] of entries) {
        if (!oldExpandedKeys?.has(ok)) {
          if (claimedKeys.has(ok)) throw keyCollisionError();
          claimedKeys.add(ok);
        }
        newExpandedKeys.add(ok);
        if (!this.has(ok) || !Object.is(this.get(ok), ov)) {
          patch.updated.set(ok, ov);
        }
      }

      if (oldExpandedKeys) {
        $Set.addAll(releasedKeys, $Set.diff(oldExpandedKeys, newExpandedKeys));
      }
      if (!$Set.equals(oldExpandedKeys, newExpandedKeys)) {
        patch.expandedKeys.set(ik, newExpandedKeys);
      }
    }
    if (selfPatch) {
      for (const ik of selfPatch.deleted) {
        hookRenderer(ik);
        $Set.addAll(releasedKeys, this.#expandedKeys.get(ik)!);
        patch.expandedKeys.set(ik, null);
      }
    }

    for (const ok of claimedKeys) {
      if (this.has(ok) && !releasedKeys.has(ok)) throw keyCollisionError();
    }
    $Set.addAll(patch.deleted, $Set.diff(releasedKeys, claimedKeys));

    return simplifyPatch(patch);
  }

  _commit(patch: ExpandedIncrementalMapPatch<IK, OK, OV>) {
    super._commit(patch);
    for (const [ik, ok] of patch.expandedKeys) {
      if (ok) {
        this.#expandedKeys.set(ik, ok);
      } else {
        this.#expandedKeys.delete(ik);
      }
    }
  }

  _clear(): void {
    super._clear();
    this.#expandedKeys.clear();
  }
}

interface ExpandedIncrementalMapPatch<IK, OK, V>
  extends IncrementalMapPatch<OK, V> {
  readonly expandedKeys: Map<IK, Set<OK> | null>;
}

function createPatch<IK, OK, V>(): ExpandedIncrementalMapPatch<IK, OK, V> {
  return {
    updated: new Map(),
    deleted: new Set(),
    expandedKeys: new Map(),
  };
}

export function simplifyPatch<IK, OK, V>(
  patch: ExpandedIncrementalMapPatch<IK, OK, V>
): ExpandedIncrementalMapPatch<IK, OK, V> | null {
  return patch.updated.size !== 0 ||
    patch.deleted.size !== 0 ||
    patch.expandedKeys.size !== 0
    ? patch
    : null;
}

function keyCollisionError() {
  return new Error(
    "Key collision encountered. " +
      "Multiple input keys were mapped to the same output key."
  );
}
