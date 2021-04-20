import { Node, TransformNode } from "../nodes";

export type ExtractOpaqueValueType<T> = T extends OpaqueValue<infer R>
  ? R
  : never;

export interface OpaqueValue<T> {
  get(): T;
}

export interface OpaqueValuePatch<T> {
  readonly value: T;
}

export abstract class OpaqueValueTransformBase<
  T,
  D extends {} = {}
> extends TransformNode<D, OpaqueValuePatch<T>> {
  constructor(dependencies: D) {
    super(dependencies);
  }

  #value: T | null = null;

  get(): T {
    this._assertConnected();
    return this.#value!;
  }

  _commit(patch: OpaqueValuePatch<T>): void {
    this.#value = patch.value;
  }

  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  _clear(): void {
    this.#value = null;
  }
}
