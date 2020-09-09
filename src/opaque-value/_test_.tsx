type C1 = { readonly x: Node<{}, { value: number }> };
type D1 = MappedOpaqueValueDependencies<string, C1>;
type P1 = PatchObject<D1>;
const d1: D1 = null as any;
const p1: P1 = null as any;
p1;

type P2 = ExtractPatchType<D1["self"]>;
const p2: P2 = null as any;
p2.value;
