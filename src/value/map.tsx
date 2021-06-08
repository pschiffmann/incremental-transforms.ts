import { HookRenderer } from "../core";
import type { IncrementalValuePatch } from "./base";
import { IncrementalValue, IncrementalValueBase } from "./base";

export type MappedIncrementalValueCallback<I, O> = (self: I) => O;

interface MappedIncrementalValueDependencies<I> {
  readonly self: IncrementalValue<I>;
}

export function map<I, O>(
  self: IncrementalValue<I>,
  callback: MappedIncrementalValueCallback<I, O>
): IncrementalValue<O> {
  const node = new MappedIncrementalValue(self, callback);
  node.connect();
  return node;
}

export class MappedIncrementalValue<I, O> extends IncrementalValueBase<
  O,
  MappedIncrementalValueDependencies<I>
> {
  constructor(
    self: IncrementalValue<I>,
    callback: MappedIncrementalValueCallback<I, O>
  ) {
    super({ self });
    this.#callback = callback;
  }

  #callback: MappedIncrementalValueCallback<I, O>;

  _initialize(
    dependencies: Map<string, IncrementalValuePatch<I>>,
    hookRenderer: HookRenderer<"self">
  ): IncrementalValuePatch<O> {
    const patch = dependencies.get("self");
    const value = hookRenderer("self", () =>
      this.#callback(patch ? patch.value : this.dependencies.self.current)
    );
    return { value };
  }

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  _render(
    dependencies: Map<string, IncrementalValuePatch<I>>,
    dirtyKeys: Set<"self">,
    hookRenderer: HookRenderer<"self">
  ): IncrementalValuePatch<O> | null {
    const patch = dependencies.get("self");
    const value = hookRenderer("self", () =>
      this.#callback(patch ? patch.value : this.dependencies.self.current)
    );
    return Object.is(this.current, value) ? null : { value };
  }
}
