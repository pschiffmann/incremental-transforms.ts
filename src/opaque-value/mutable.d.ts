import { OpaqueValue, OpaqueValuePatch } from "./base";
import { SourceNode } from "../nodes";
export declare function mutable<T>(initialValue: T): OpaqueValue<T>;
export declare class MutableOpaqueValue<T>
  extends SourceNode<OpaqueValuePatch<T>>
  implements OpaqueValue<T> {
  #private;
  constructor(initialValue: T);
  get(): T;
  set(value: T): void;
  _commit(patch: OpaqueValuePatch<T>): void;
}
