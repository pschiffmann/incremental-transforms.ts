import { OpaqueValue, OpaqueValueTransformBase } from "./base";
import type { OpaqueValuePatch } from "./base";
import { ExtractContextValues, PatchObject } from "../utility-types";
import { _addNode } from "../nodes";

export type MappedOpaqueValueCallback<I, O, C extends {}> = (
  self: I,
  context: ExtractContextValues<C, "self">
) => O;

type MappedOpaqueValueDependencies<I, C extends {}> = {
  readonly self: OpaqueValue<I>;
} & Omit<C, "self">;

export function map<I, O, C extends {}>(
  self: OpaqueValue<I>,
  callback: MappedOpaqueValueCallback<I, O, C>,
  context?: C
): OpaqueValue<O> {
  const node = new MappedOpaqueValue(self, callback, context ?? ({} as C));
  _addNode(node);
  return node;
}

export class MappedOpaqueValue<
  I,
  O,
  C extends {}
> extends OpaqueValueTransformBase<O, MappedOpaqueValueDependencies<I, C>> {
  constructor(
    self: OpaqueValue<I>,
    callback: MappedOpaqueValueCallback<I, O, C>,
    context: C
  ) {
    super({ self, ...context });
    this.#callback = callback;

    if (context.hasOwnProperty("self")) {
      throw new Error(
        "The reserved keyword `self` can't be used as a context key."
      );
    }
  }

  #callback: MappedOpaqueValueCallback<I, O, C>;

  _render(
    patch: PatchObject<MappedOpaqueValueDependencies<I, C>>
  ): OpaqueValuePatch<O> {
    const context: any = {};
    for (const [key, node] of Object.entries(this._dependencies)) {
      if (key === "self") continue;
      context[key] =
        ((patch as any)[key] as OpaqueValuePatch<any>).value ?? node.get();
    }
    const result = this.#callback(
      patch.self.value ?? this._dependencies.self.get(),
      context
    );
    return { value: result };
  }
}
