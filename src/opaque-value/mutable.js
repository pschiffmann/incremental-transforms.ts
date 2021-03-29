import { SourceNode } from "../core";
export function mutable(initialValue) {
  return new MutableOpaqueValue(initialValue);
}
export class MutableOpaqueValue extends SourceNode {
  constructor(initialValue) {
    super();
    this.#value = initialValue;
  }
  #value;
  get() {
    return this.#value;
  }
  set(value) {
    this._setState((patch) =>
      Object.is(this.#value, value) ? null : { value }
    );
  }
  _commit(patch) {
    this.#value = patch.value;
  }
}
