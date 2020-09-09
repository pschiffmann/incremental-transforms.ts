import { OpaqueValue, OpaqueValuePatch } from "./base";
import { _addNode, Node, SourceNode } from "../core";

export function mutable<T>(initialValue: T): OpaqueValue<T> {
  const node = new MutableOpaqueValue(initialValue);
  _addNode(node);
  return node;
}

interface MutableOpaqueValuePatch<T> extends OpaqueValuePatch<T> {
  value: T;
}

export class MutableOpaqueValue<T>
  extends SourceNode<MutableOpaqueValuePatch<T>>
  implements OpaqueValue<T> {
  constructor(initialValue: T) {
    super();
    this.#value = initialValue;
  }

  #value: T;

  get(): T {
    this._assertConnected();
    return this.#value;
  }

  set(value: T): void {
    this._setState((patch) => (patch.value = value));
  }

  protected _createPatch(): MutableOpaqueValuePatch<T> {
    return { value: null as any };
  }

  protected _commit(patch: MutableOpaqueValuePatch<T>): void {
    this.#value = patch.value;
  }
}
