import { OpaqueValueTransformBase } from "../opaque-value";
import { OpaqueValuePatch } from "../opaque-value/base";
import type { IncrementalMap, IncrementalMapPatch } from "./base";

interface Dependencies {
  readonly self: IncrementalMap<unknown, unknown>;
}

export function size(
  self: IncrementalMap<unknown, unknown>
): IncrementalMapSize {
  const result = new IncrementalMapSize(self);
  result.connect();
  return result;
}

export class IncrementalMapSize extends OpaqueValueTransformBase<
  number,
  Dependencies
> {
  constructor(self: IncrementalMap<unknown, unknown>) {
    super({ self });
  }

  _initialize(patches: Map<string, unknown>): OpaqueValuePatch<number> {
    const { self } = this.dependencies;
    const selfPatch = patches.get("self") as
      | IncrementalMapPatch<unknown, unknown>
      | undefined;
    let value = self.size;
    if (selfPatch) {
      for (const [k] of selfPatch.updated) {
        if (!self.has(k)) value++;
      }
      value -= selfPatch.deleted.size;
    }
    return { value };
  }

  _render(patches: Map<string, unknown>): OpaqueValuePatch<number> | null {
    const patch = this._initialize(patches);
    return patch.value !== this.get() ? patch : null;
  }
}
