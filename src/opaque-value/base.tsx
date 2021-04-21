import { Node, TransformNode } from "../core";

export type ExtractOpaqueValueType<T> = T extends OpaqueValue<infer R>
  ? R
  : never;

/**
 * Creates a type with the same keys as `C` except those listed in `R`.
 */
export declare type ExtractContextValues<C extends {}, R extends keyof any> = {
  readonly [K in keyof Omit<C, R>]: ExtractOpaqueValueType<C[K]>;
};

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
