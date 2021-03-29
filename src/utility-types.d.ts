import type { SourceNode, TransformNode } from "./nodes";
import { ExtractOpaqueValueType } from "./opaque-value/base";
/**
 * Creates a type with the same keys as `D`, but converts each node type to its
 * patch type. All values in `D` must be `Node`s.
 */
export declare type PatchObject<D extends {}> = {
  [K in keyof D]: ExtractPatchType<D[K]>;
};
/**
 * If `T` is a `Node`, resolves its `P` type parameter.
 */
export declare type ExtractPatchType<T> = T extends SourceNode<infer P>
  ? P
  : T extends TransformNode<any, infer P, any>
  ? P
  : never;
/**
 * Creates a type with the same keys as `C` except those listed in `R`, and
 */
export declare type ExtractContextValues<C extends {}, R extends keyof any> = {
  readonly [K in keyof Omit<C, R>]: ExtractOpaqueValueType<C[K]>;
};
