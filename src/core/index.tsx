export { useEffect, useMemo, useRef, useState } from "./hooks";
export { SourceNode, TransformNode } from "./nodes";
export type { HookRenderer, Node, PatchObject } from "./nodes";
export { transaction } from "./transaction";

/**
 * Connects `node` and returns a disconnect callback.
 * 
 * Throws an error if `node` is already connected, or if any dependency is not
 * connected.
 * 
 * Connecting and disconnecting are executed in a transaction. If `connect()` is
 * called inside a `transaction()` and throws an error, the whole transaction is
 * aborted. Likewise, if either `connect()` or the disconnect callback are
 * called during a transaction and the transaction is aborted, the `connected`
 * state of `node` doesn't change.
 */
// export function connect(node: TransformNode): () => void {}
