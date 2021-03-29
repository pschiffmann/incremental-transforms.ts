import { OpaqueValueTransformBase } from "./base";
export function map(self, callback) {
  const node = new MappedOpaqueValue(self, callback);
  node.connect();
  return node;
}
export class MappedOpaqueValue extends OpaqueValueTransformBase {
  constructor(self, callback) {
    super({ self });
    this.#callback = callback;
  }
  #callback;
  _initialize(dependencies, hookRenderer) {
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
  _render(dependencies, dirtyKeys, hookRenderer) {
    const value = hookRenderer("self", () =>
      this.#callback(
        dependencies ? dependencies.self : this.dependencies.self.get()
      )
    );
    return Object.is(this.get(), value) ? null : { value };
  }
}
