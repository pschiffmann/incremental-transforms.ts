import { Context, UnpackContext } from "../value";
import { IncrementalMap } from "./base";

interface Inputs {
  readonly [K: string]: IncrementalMap<unknown, unknown>;
}

type MapKeys<I extends Inputs, OK> = {
  readonly [K in keyof I]?: I[K] extends IncrementalMap<infer IK, any>
    ? (inputKey: IK) => OK
    : never;
};

type UnpackInputs<I extends Inputs, OV> = {
  readonly [K in keyof I]?: I[K] extends IncrementalMap<any, infer IV>
    ? IV
    : never;
};

/**
 * Merges multiple incremental maps.
 *
 * For each input map, a key mapping can be provided; for inputs without a key
 * mapping, the input key is used as the output key. Key mappings must be
 * injective.
 *
 * All values that for the same output key are passed to `mapValue`; if one or
 * more inputs don't contain a value for this key, these values are not passed
 * to `mapValue`.
 */
export function merge<I extends Inputs, OK, OV, C extends Context>(
  inputs: I,
  mapValue: (inputs: UnpackInputs<I, OV>, context: UnpackContext<C>) => OV,
  o?: { context?: C; mapKey?: MapKeys<I, OK> }
): IncrementalMap<OK, OV> {
  return null as any;
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
