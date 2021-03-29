import { HookRenderer } from "../nodes";
import { PatchObject } from "../utility-types";
import type { OpaqueValuePatch } from "./base";
import { OpaqueValue, OpaqueValueTransformBase } from "./base";
export declare type MappedOpaqueValueCallback<I, O> = (self: I) => O;
interface MappedOpaqueValueDependencies<I> {
  readonly self: OpaqueValue<I>;
}
export declare function map<I, O>(
  self: OpaqueValue<I>,
  callback: MappedOpaqueValueCallback<I, O>
): OpaqueValue<O>;
export declare class MappedOpaqueValue<I, O> extends OpaqueValueTransformBase<
  O,
  MappedOpaqueValueDependencies<I>
> {
  #private;
  constructor(self: OpaqueValue<I>, callback: MappedOpaqueValueCallback<I, O>);
  _initialize(
    dependencies: PatchObject<MappedOpaqueValueDependencies<I>>,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O>;
  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  _render(
    dependencies: PatchObject<MappedOpaqueValueDependencies<I>>,
    dirtyKeys: Set<"self">,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O> | null;
}
export {};
