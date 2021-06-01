import { IncrementalValue, IncrementalValuePatch } from "./base";
import { Node, SourceNode } from "../core";

export function mutable<T>(initialValue: T): IncrementalValue<T> {
  return new MutableIncrementalValue(initialValue);
}

export class MutableIncrementalValue<T>
  extends SourceNode<IncrementalValuePatch<T>>
  implements IncrementalValue<T> {
  constructor(initialValue: T) {
    super();
    this.#value = initialValue;
  }

  #value: T;

  get current(): T {
    return this.#value;
  }

  set current(value: T) {
    this._setState((patch) =>
      Object.is(this.#value, value) ? null : { value }
    );
  }

  _commit(patch: IncrementalValuePatch<T>): void {
    this.#value = patch.value;
  }
}
