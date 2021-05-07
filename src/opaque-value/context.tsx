import type { OpaqueValue, OpaqueValuePatch } from "./base";

export interface Context {
  readonly [K: string]: OpaqueValue<any>;
}

export type UnpackContext<C extends Context> = {
  readonly [K in keyof C]: C[K] extends OpaqueValue<infer T> ? T : never;
};

export function buildContext<C extends Context>(
  dependencies: C,
  patches: Map<string, unknown>
): UnpackContext<C> {
  const result: any = {};
  for (const [k, v] of Object.entries(dependencies)) {
    result[k] = patches.has(k)
      ? (patches.get(k) as OpaqueValuePatch<unknown>).value
      : v.get();
  }
  return result;
}

// The following interfaces allow specifying a list of _restricted_ properties
// that can not be used as context names. E.g. `TestCtx` can't contain
// properties `self` or `other`. The example below produces a ts error, but the
// error message is more confusing than helpful. Needs more investigation.
//
// interface UnrestrictedContext {
//   readonly [K: string]: OpaqueValue<any>;
// }
// export type Context<R extends string = never> = Omit<UnrestrictedContext, R> &
//   { readonly [K in R]?: never };

// type TestCtx = Context<"self" | "other">;
// let ctx: TestCtx = {
//   a: (null as any) as OpaqueValue<string>,
//   self: (null as any) as OpaqueValue<number>,
// };
