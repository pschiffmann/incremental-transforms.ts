import { HookRenderer } from "../core";
import * as $Set from "../util/set";
import { buildContext, Context, UnpackContext } from "../value";
import {
  createPatch,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
  simplifyPatch,
} from "./base";

interface Inputs<K> {
  readonly [T: string]: IncrementalMap<K, unknown>;
}

type UnpackValues<K, I extends Inputs<K>> = {
  readonly [E in keyof I]?: I[E] extends IncrementalMap<K, infer IV>
    ? IV
    : never;
};

type MergedIncrementalMapCallback<
  K,
  I extends Inputs<K>,
  OV,
  C extends Context
> = (key: K, values: UnpackValues<K, I>, context: UnpackContext<C>) => OV;

/**
 * Merges multiple incremental maps.
 *
 * All values for the same key are passed to `mergeValues`; if one or more
 * inputs don't contain a value for this key, these values are not passed to
 * `mapValue`; you can check this with the `in` operator or
 * `Object.hasOwnProperty()`.
 */
export function merge<K, I extends Inputs<K>, OV, C extends Context>(
  inputs: I,
  mergeValues: MergedIncrementalMapCallback<K, I, OV, C>,
  context?: C
): IncrementalMap<K, OV> {
  const result = new MergedIncrementalMap(inputs, mergeValues, context);
  result.connect();
  return result;
}

export class MergedIncrementalMap<
  K,
  I extends Inputs<K>,
  OV,
  C extends Context
> extends IncrementalMapBase<K, OV, I & C> {
  constructor(
    inputs: I,
    mergeValues: MergedIncrementalMapCallback<K, I, OV, C>,
    context?: C
  ) {
    super({ ...inputs, ...context } as any);
    if (
      context &&
      Object.keys(inputs).length + Object.keys(context).length !==
        Object.keys(this.dependencies).length
    ) {
      throw new Error("`inputs` and `context` must not share keys.");
    }
    this.#mergeValues = mergeValues;
    this.#inputs = inputs;
    this.#context = context ?? ({} as any);
  }

  #mergeValues: MergedIncrementalMapCallback<K, I, OV, C>;
  #inputs: I;
  #context: C;

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {
    const patch = createPatch<K, OV>();
    const ctx = buildContext(this.#context, patches);

    for (const [k, values] of getDirtyEntries<K, I>(
      this.#inputs,
      patches as any
    )) {
      const result = hookRenderer(k, () => this.#mergeValues(k, values, ctx));
      patch.updated.set(k, result);
    }

    return simplifyPatch(patch);
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {
    const patch = createPatch<K, OV>();
    const ctx = buildContext(this.#context, patches);

    for (const [k, values] of getDirtyEntries<K, I>(
      this.#inputs,
      patches as any,
      dirtyKeys
    )) {
      const result = hookRenderer(k, () => this.#mergeValues(k, values, ctx));
      patch.updated.set(k, result);
    }
    $Set.addAll(patch.deleted, getDeletedKeys(this.#inputs, patches as any));

    return simplifyPatch(patch);
  }
}

/**
 * Yields an entry for every distinct key that needs to be rendered. This
 * includes all keys from any incremental map patch in `patches`, and all
 * `dirtyKeys`, except those that have been deleted from all `inputs` by
 * `patches`. Passing no `dirtyKeys` is equivalent to passing the union over all
 * `inputs` keys.
 */
function* getDirtyEntries<K, I extends Inputs<K>>(
  inputs: I,
  patches: Map<string, IncrementalMapPatch<K, unknown>>,
  dirtyKeys?: Iterable<K>
): Iterable<[K, UnpackValues<K, I>]> {
  const discoveredKeys = new Set<K>(dirtyKeys);
  for (const [inputName, map] of Object.entries(inputs)) {
    const patch = patches.get(inputName);
    if (patch) $Set.addAll(discoveredKeys, patch.updated.keys());
    if (!dirtyKeys) {
      for (const k of map.keys()) {
        if (!patch?.deleted.has(k)) discoveredKeys.add(k);
      }
    }
  }
  for (const k of discoveredKeys) {
    const values: any = {};
    let deletedFromAllInputs = true;
    for (const [inputName, map] of Object.entries(inputs)) {
      const patch = patches.get(inputName);
      if (patch?.updated.has(k)) {
        values[inputName] = patch.updated.get(k);
        deletedFromAllInputs = false;
      } else if (!patch?.deleted.has(k) && map.has(k)) {
        values[inputName] = map.get(k);
        deletedFromAllInputs = false;
      }
    }
    if (!deletedFromAllInputs) {
      yield [k, values];
    }
  }
}

function getDeletedKeys<K, I extends Inputs<K>>(
  inputs: I,
  patches: Map<string, IncrementalMapPatch<K, unknown>>
): Set<K> {
  const discoveredKeys = new Set<K>();
  for (const inputName of Object.keys(inputs)) {
    const patch = patches.get(inputName);
    if (patch) $Set.addAll(discoveredKeys, patch.deleted);
  }
  checkKey: for (const k of discoveredKeys) {
    for (const [inputName, map] of Object.entries(inputs)) {
      const patch = patches.get(inputName);
      if (patch?.updated.has(k) || (map.has(k) && !patch?.deleted.has(k))) {
        discoveredKeys.delete(k);
        continue checkKey;
      }
    }
  }
  return discoveredKeys;
}

// The current types can't resolve `OK` and `OV`. As a workaround, specify the
// variable type. This way you don't need to type out the types for `I` and `C`.
//
// const m: IncrementalMap<string, string> = merge(
//   (null as any) as {
//     a: IncrementalMap<string, string>;
//     b: IncrementalMap<number, URL>;
//   },
//   ({ a, b }, { x, y }) => `${a}${b}${x}${y}`,
//   {
//     context: (null as any) as {
//       x: IncrementalValue<boolean>;
//       y: IncrementalValue<symbol>;
//     },
//     mapKey: {
//       a(k) {
//         return "";
//       },
//       b(k) {
//         return `${k}`;
//       },
//     },
//   }
// );
