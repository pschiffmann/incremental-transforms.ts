import { TransformNode } from "../core";
export class OpaqueValueTransformBase extends TransformNode {
  constructor(dependencies) {
    super(dependencies);
    this.#value = null;
  }
  #value;
  get() {
    this._assertConnected();
    return this.#value;
  }
  _commit(patch) {
    this.#value = patch.value;
  }
  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  _clear() {
    this.#value = null;
  }
}
