import type { PatchObject } from "../core";
import { HookRenderer } from "../core";
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
    dependencies: Map<string, OpaqueValuePatch<I>>,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O> {
    const patch = dependencies.get("self");
    const value = hookRenderer("self", () =>
      this.#callback(patch ? patch.value : this.dependencies.self.get())
    );
    return { value };
  }

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  _render(
    dependencies: Map<string, OpaqueValuePatch<I>>,
    dirtyKeys: Set<"self">,
    hookRenderer: HookRenderer<"self">
  ): OpaqueValuePatch<O> | null {
    const patch = dependencies.get("self");
    const value = hookRenderer("self", () =>
      this.#callback(patch ? patch.value : this.dependencies.self.get())
    );
    return Object.is(this.get(), value) ? null : { value };
  }
}
