import { Node, TransformNode } from "../nodes";

export type ExtractOpaqueValueType<T> = T extends OpaqueValue<infer R>
  ? R
  : never;

export interface OpaqueValue<T> extends Node<OpaqueValuePatch<T>> {
  get(): T;
}

export interface OpaqueValuePatch<T> {
  readonly value: T;
}

export abstract class OpaqueValueTransformBase<
  T,
  D extends {} = {},
  P extends OpaqueValuePatch<T> = OpaqueValuePatch<T>
> extends TransformNode<D, P> {
  #value: T | null = null;

  get(): T {
    this._assertConnected();
    return this.#value!;
  }

  _commit(patch: P): void {
    this.#value = patch.value;
  }
}
