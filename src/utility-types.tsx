import type { Node, SourceNode, TransformNode } from "./nodes";
import { ExtractOpaqueValueType, OpaqueValue } from "./opaque-value/base";

/**
 * Creates a type with the same keys as `D`, but converts each node type to its
 * patch type. All values in `D` must be `Node`s.
 */
export type PatchObject<D extends {}> = {
  [K in keyof D]: ExtractPatchType<D[K]>;
};

/**
 * If `T` is a `Node`, resolves its `P` type parameter.
 */
export type ExtractPatchType<T> = T extends SourceNode<infer P>
  ? P
  : T extends TransformNode<any, infer P, any>
  ? P
  : never;

/**
 * Creates a type with the same keys as `C` except those listed in `R`, and
 */
export type ExtractContextValues<C extends {}, R extends keyof any> = {
  readonly [K in keyof Omit<C, R>]: ExtractOpaqueValueType<C[K]>;
};

//
// tests
//
function f<C extends {}, R>(
  c: C,
  f: (c: ExtractContextValues<C, "self" | "other">) => R
): R {
  return null as any;
}
let x: OpaqueValue<number>;
let y: string;
let self: OpaqueValue<boolean>;
f({ x, y, self, other }, (c) => {
  console.log(c.x.toString(), c.y, c.self, c.other);
  return c.y;
});
