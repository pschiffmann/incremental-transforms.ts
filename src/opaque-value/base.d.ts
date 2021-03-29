import { TransformNode } from "../nodes";
export declare type ExtractOpaqueValueType<T> = T extends OpaqueValue<infer R>
  ? R
  : never;
export interface OpaqueValue<T> {
  get(): T;
}
export interface OpaqueValuePatch<T> {
  readonly value: T;
}
export declare abstract class OpaqueValueTransformBase<
  T,
  D extends {} = {}
> extends TransformNode<D, OpaqueValuePatch<T>> {
  #private;
  constructor(dependencies: D);
  get(): T;
  _commit(patch: OpaqueValuePatch<T>): void;
  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  _clear(): void;
}
