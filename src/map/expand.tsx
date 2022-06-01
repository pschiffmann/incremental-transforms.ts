import * as $Iterable from "@pschiffmann/std/iterable";
import * as $Map from "@pschiffmann/std/map";
import * as $Set from "@pschiffmann/std/set";
import { HookRenderer } from "../core/index.js";
import { buildContext, Context, UnpackContext } from "../value/index.js";
import {
  getDirtyEntries,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
} from "./base.js";

type ExpandCallback<IK, IV, OK, EV, C extends Context> = (
  key: IK,
  value: IV,
  context: UnpackContext<C>
) => Iterable<[OK, EV]>;

type MergeCallback<IK, OK, EV, OV, C extends Context> = (
  key: OK,
  values: Map<IK, EV>,
  context: UnpackContext<C>
) => OV;

type Dependencies<K, V, C extends Context> = Omit<C, "self"> & {
  readonly self: IncrementalMap<K, V>;
};

export function expand<IK, IV, OK, OV, C extends Context>(
  self: IncrementalMap<IK, IV>,
  expand: ExpandCallback<IK, IV, OK, OV, C>,
  context?: C
): IncrementalMapBase<OK, OV>;
export function expand<IK, IV, OK, EV, OV, C extends Context>(
  self: IncrementalMap<IK, IV>,
  expand: ExpandCallback<IK, IV, OK, EV, C>,
  merge: MergeCallback<IK, OK, EV, OV, C>,
  context?: C
): IncrementalMapBase<OK, OV>;
export function expand(
  self: IncrementalMap<unknown, unknown>,
  expand: ExpandCallback<unknown, unknown, unknown, unknown, {}>,
  arg3:
    | MergeCallback<unknown, unknown, unknown, unknown, {}>
    | Context
    | undefined,
  arg4?: Context
): IncrementalMapBase<unknown, unknown> {
  const result = new ExpandedIncrementalMap(
    self,
    expand,
    typeof arg3 === "function" ? arg3 : assertSingleValue,
    typeof arg3 === "function" ? arg4 : arg3
  );
  result.connect();
  return result;
}

export class ExpandedIncrementalMap<
  IK,
  IV,
  OK,
  EV,
  OV,
  C extends Context
> extends IncrementalMapBase<OK, OV, Dependencies<IK, IV, C>, IK> {
  constructor(
    self: IncrementalMap<IK, IV>,
    expand: ExpandCallback<IK, IV, OK, EV, C>,
    merge: MergeCallback<IK, OK, EV, OV, C>,
    context?: C
  ) {
    if (context?.hasOwnProperty("self")) {
      throw new Error("`context` must not have a key `self`.");
    }
    super({ ...context, self } as any);
    this.#expand = expand;
    this.#merge = merge;
  }

  #expand: ExpandCallback<IK, IV, OK, EV, C>;
  #merge: MergeCallback<IK, OK, EV, OV, C>;

  /**
   * For each input key in `dependencies.self`, stores the output keys that were
   * returned by the last call to `#expand()`. Doesn't contain empty sets (input
   * keys for which `#expand()` returned no output keys).
   */
  #expandedKeys = new Map<IK, Set<OK>>();

  /**
   * For each output keys, stores all input keys that were `#expand()`ed into
   * this key, and their respective values.
   */
  #expandedValues = new Map<OK, Map<IK, EV>>();

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<IK>
  ): ExpandedIncrementalMapPatch<IK, OK, EV, OV> | null {
    const patch = createPatch<IK, OK, EV, OV>();
    const getExpandedValues = (ok: OK) =>
      $Map.putIfAbsent(patch.expandedValues, ok, () => new Map<IK, EV>());

    const { self, ...context } = this.dependencies;
    const ctx = buildContext(context as unknown as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    for (const [ik, iv] of getDirtyEntries(self, selfPatch, self.keys())) {
      const expandedKeys = new Set<OK>();
      const entries = hookRenderer(ik, () => this.#expand(ik, iv, ctx));
      for (const [ok, ev] of entries) {
        if (expandedKeys.has(ok)) throwOnDuplicateKey();
        expandedKeys.add(ok);
        getExpandedValues(ok).set(ik, ev);
      }
      if (expandedKeys.size !== 0) patch.expandedKeys.set(ik, expandedKeys);
    }
    for (const [ok, ev] of patch.expandedValues) {
      const value = this.#merge(ok, new Map(ev), ctx);
      patch.updated.set(ok, value);
    }

    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<IK>,
    hookRenderer: HookRenderer<IK>
  ): ExpandedIncrementalMapPatch<IK, OK, EV, OV> | null {
    const patch = createPatch<IK, OK, EV, OV>();
    const getExpandedValues = (ok: OK) =>
      $Map.putIfAbsent(
        patch.expandedValues,
        ok,
        () => new Map(this.#expandedValues.get(ok))
      );

    const { self, ...context } = this.dependencies;
    const ctx = buildContext(context as unknown as C, patches);
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<IK, IV>
      | undefined;

    const contextChanged = patches.size !== Number(!!selfPatch);
    for (const [ik, iv] of getDirtyEntries(
      self,
      selfPatch,
      contextChanged ? self.keys() : dirtyKeys
    )) {
      const expandedKeys = new Set<OK>();
      const entries = hookRenderer(ik, () => this.#expand(ik, iv, ctx));
      for (const [ok, ev] of entries) {
        if (expandedKeys.has(ok)) throwOnDuplicateKey();
        expandedKeys.add(ok);
        getExpandedValues(ok).set(ik, ev);
      }

      const prevExpandedKeys = this.#expandedKeys.get(ik);
      if (prevExpandedKeys) {
        for (const ok of prevExpandedKeys) {
          if (!expandedKeys.has(ok)) getExpandedValues(ok).delete(ik);
        }
        if (!$Set.equals(prevExpandedKeys, expandedKeys)) {
          patch.expandedKeys.set(ik, expandedKeys);
        }
      } else if (expandedKeys.size !== 0) {
        patch.expandedKeys.set(ik, expandedKeys);
      }
    }
    if (selfPatch) {
      for (const ik of selfPatch.deleted) {
        hookRenderer(ik);
        const prevExpandedKeys = this.#expandedKeys.get(ik);
        if (prevExpandedKeys) {
          patch.expandedKeys.set(ik, new Set());
          for (const ok of prevExpandedKeys) {
            getExpandedValues(ok).delete(ik);
          }
        }
      }
    }

    for (const [ok, ev] of patch.expandedValues) {
      const prevExpandedValues = this.#expandedValues.get(ok);
      const equal = !!prevExpandedValues && $Map.equals(prevExpandedValues, ev);
      if (equal) patch.expandedValues.delete(ok);
      if (!equal || contextChanged) {
        const value = this.#merge(ok, new Map(ev), ctx);
        if (!this.has(ok) || !Object.is(value, this.get(ok))) {
          patch.updated.set(ok, value);
        }
      }
    }

    return simplifyPatch(patch);
  }

  _commit(patch: ExpandedIncrementalMapPatch<IK, OK, EV, OV>) {
    super._commit(patch);
    for (const [ik, ok] of patch.expandedKeys) {
      if (ok.size !== 0) {
        this.#expandedKeys.set(ik, ok);
      } else {
        this.#expandedKeys.delete(ik);
      }
    }
    for (const [ok, expandedValues] of patch.expandedValues) {
      if (expandedValues.size !== 0) {
        this.#expandedValues.set(ok, expandedValues);
      } else {
        this.#expandedValues.delete(ok);
      }
    }
  }

  _clear(): void {
    super._clear();
    this.#expandedKeys.clear();
    this.#expandedValues.clear();
  }
}

interface ExpandedIncrementalMapPatch<IK, OK, EV, OV>
  extends IncrementalMapPatch<OK, OV> {
  readonly expandedKeys: Map<IK, Set<OK>>;
  readonly expandedValues: Map<OK, Map<IK, EV>>;
}

function createPatch<IK, OK, EV, OV>(): ExpandedIncrementalMapPatch<
  IK,
  OK,
  EV,
  OV
> {
  return {
    updated: new Map(),
    deleted: new Set(),
    expandedKeys: new Map(),
    expandedValues: new Map(),
  };
}

export function simplifyPatch<IK, OK, EV, OV>(
  patch: ExpandedIncrementalMapPatch<IK, OK, EV, OV>
): ExpandedIncrementalMapPatch<IK, OK, EV, OV> | null {
  return patch.updated.size !== 0 ||
    patch.deleted.size !== 0 ||
    patch.expandedKeys.size !== 0 ||
    patch.expandedValues.size !== 0
    ? patch
    : null;
}

function assertSingleValue<IK, OK, OV>(key: OK, values: Map<IK, OV>): OV {
  if (values.size === 1) return $Iterable.first(values.values())!;
  throw new Error(
    "Key collision encountered. " +
      "Multiple input keys were mapped to the same output key."
  );
}

function throwOnDuplicateKey(): never {
  throw new Error(
    "A single input key can't be expanded into the same output key twice."
  );
}
