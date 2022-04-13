import { SourceNode } from "../core/index.js";
import { IncrementalValue, IncrementalValuePatch } from "./base.js";

export function mutable<T>(initialValue: T): MutableIncrementalValue<T> {
  return new MutableIncrementalValue(initialValue);
}

export class MutableIncrementalValue<T>
  extends SourceNode<IncrementalValuePatch<T>>
  implements IncrementalValue<T>
{
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

  update(f: (previous: T) => T): void {
    this._setState((patch) => {
      const previous = patch ? patch.value : this.#value;
      const value = f(previous);
      return Object.is(this.#value, value) ? null : { value };
    });
  }

  _commit(patch: IncrementalValuePatch<T>): void {
    this.#value = patch.value;
  }
}
