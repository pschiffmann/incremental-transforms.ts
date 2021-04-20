import { HookRenderer } from "../nodes";
import { ExtractContextValues, PatchObject } from "../utility-types";
import type { OpaqueValuePatch } from "./base";
import { OpaqueValue, OpaqueValueTransformBase } from "./base";

export type MappedOpaqueValueCallback<I, O> = (self: I) => O;

interface MappedOpaqueValueDependencies<I> {
  readonly self: OpaqueValue<I>;
}

export function map<I, O>(
  self: OpaqueValue<I>,
  callback: MappedOpaqueValueCallback<I, O>
): OpaqueValue<O> {
  const node = new MappedOpaqueValue(self, callback);
  node.connect();
  return node;
}

export class MappedOpaqueValue<I, O> extends OpaqueValueTransformBase<
  O,
  MappedOpaqueValueDependencies<I>
> {
  constructor(self: OpaqueValue<I>, callback: MappedOpaqueValueCallback<I, O>) {
    super({ self });
    this.#callback = callback;
  }

  #callback: MappedOpaqueValueCallback<I, O>;

  _initialize(
    dependencies: PatchObject<MappedOpaqueValueDependencies<I>>,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O> {
    const value = hookRenderer("self", () =>
      this.#callback(
        dependencies ? dependencies.self : this.dependencies.self.get()
      )
    );
    return { value };
  }

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  _render(
    dependencies: PatchObject<MappedOpaqueValueDependencies<I>>,
    dirtyKeys: Set<"self">,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O> | null {
    const value = hookRenderer("self", () =>
      this.#callback(
        dependencies ? dependencies.self : this.dependencies.self.get()
      )
    );
    return Object.is(this.get(), value) ? null : { value };
  }
}
