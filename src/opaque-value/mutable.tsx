import { OpaqueValue, OpaqueValuePatch } from "./base";
import { Node, SourceNode } from "../core";

export function mutable<T>(initialValue: T): OpaqueValue<T> {
  return new MutableOpaqueValue(initialValue);
}

export class MutableOpaqueValue<T>
  extends SourceNode<OpaqueValuePatch<T>>
  implements OpaqueValue<T> {
  constructor(initialValue: T) {
    super();
    this.#value = initialValue;
  }

  #value: T;

  get(): T {
    return this.#value;
  }

  set(value: T): void {
    this._setState((patch) =>
      Object.is(this.#value, value) ? null : { value }
    );
  }

  _commit(patch: OpaqueValuePatch<T>): void {
    this.#value = patch.value;
  }
}
