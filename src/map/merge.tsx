import { HookRenderer } from "../core";
import * as $Set from "../util/set";
import { Context, UnpackContext } from "../value";
import {
  createPatch,
  IncrementalMap,
  IncrementalMapBase,
  IncrementalMapPatch,
} from "./base";

interface Inputs<K> {
  readonly [T: string]: IncrementalMap<K, unknown>;
}

type UnpackValues<K, I extends Inputs<K>> = {
  readonly [K in keyof I]?: I[K] extends IncrementalMap<K, infer IV>
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
    this.#contextKeys = new Set(context && Object.keys(context));
  }

  #mergeValues: MergedIncrementalMapCallback<K, I, OV, C>;
  #contextKeys: Set<string>;

  _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {
    const [inputs, context] = splitDependencies(
      this.dependencies,
      this.#contextKeys
    );
    const allOutKeys = new Set<OK>();
    // Contains an entry for each key in `#mapKey`. The nested map contains
    // (out key, in key) tuples.
    const reverseMappedKeys = new Map<string, Map<any, any>>();
    for (const [name, map] of Object.entries(inputs)) {
      const allInKeys = new Set(map.keys());
      const patch = patches.get(name) as
        | IncrementalMapPatch<unknown, unknown>
        | undefined;
      if (patch) {
        $Set.addAll(allInKeys, patch.updated.keys());
        for (const k of patch.deleted) allInKeys.delete(k);
      }
      const mapKey = this.#mapKey?.[name];
      if (mapKey) {
        const reverseMap = new Map<any, any>();
        reverseMappedKeys.set(name, reverseMap);
        for (const ik of allInKeys) {
          const ok = mapKey(ik);
          if (reverseMap.has(ok)) {
            throw new Error("`mapKey` is not injective.");
          }
          reverseMap.set(ok, ik);
          allOutKeys.add(ok);
        }
      } else {
        $Set.addAll(allOutKeys, allInKeys);
      }
    }

    const patch = createPatch();
    for (const ok of allOutKeys) {
      const originalKeys: any /*UnpackKeys<I>*/ = {};
      const values: any /*UnpackValues<I>*/ = {};
      for (const [name, map] of Object.entries(inputs)) {
        const patch = patches.get(name);
      }
      const result = hookRenderer(ok, () =>
        this.#mergeValues(ok, originalKeys, values, context)
      );
    }
  }

  _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): IncrementalMapPatch<K, OV> | null {}
}

// class PatchedMapView<K, V> {
//   constructor(
//     private map: IncrementalMap<K, V>,
//     private patch: IncrementalMapPatch<K, V> | undefined
//   ) {}

//   *keys() {
//     if (this.patch) {
//       yield* this.patch.updated.keys();
//       for (const k of this.map.keys()) {
//         if (!this.patch.deleted.has(k)) yield k;
//       }
//     } else {
//       yield* this.map.keys();
//     }
//   }

//   has(key: K): boolean {
//     if (this.patch) {
//       if (this.patch.updated.has(key)) return true;
//       if (this.patch.deleted.has(key)) return false;
//     }
//     return this.map.has(key);
//   }

//   get(key: K): V | undefined {
//     if (this.patch) {
//       if (this.patch.updated.has(key)) return this.patch.updated.get(key);
//       if (this.patch.deleted.has(key)) return undefined;
//     }
//     return this.map.get(key);
//   }
// }

function splitDependencies<K, I extends Inputs<K>, C extends Context>(
  dependencies: I & C,
  contextKeys: Set<string>
): [I, C] {
  const inputs: any = {};
  const context: any = {};
  for (const [k, v] of Object.entries(dependencies)) {
    (contextKeys.has(k) ? inputs : context)[k] = v;
  }
  return [inputs, context];
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
