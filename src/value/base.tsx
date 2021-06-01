import type { Node } from "../core";
import { TransformNode } from "../core";

export interface IncrementalValue<T> extends Node {
  readonly current: T;
}

export interface IncrementalValuePatch<T> {
  readonly value: T;
}

export abstract class IncrementalValueTransformBase<T, D extends {} = {}>
  extends TransformNode<D, IncrementalValuePatch<T>>
  implements IncrementalValue<T> {
  constructor(dependencies: D) {
    super(dependencies);
  }

  #value: T | null = null;

  get current(): T {
    this._assertConnected();
    return this.#value!;
  }

  _commit(patch: IncrementalValuePatch<T>): void {
    this.#value = patch.value;
  }

  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  _clear(): void {
    this.#value = null;
  }
}
