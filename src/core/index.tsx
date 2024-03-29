export { useEffect, useMemo, useRef, useState } from "./hooks.js";
export { SourceNode, TransformNode } from "./nodes.js";
export type { HookRenderer, Node, PatchObject } from "./nodes.js";
export { transaction } from "./transaction.js";
export type { OnCommitCallback } from "./transaction.js";

// TODO:
// `export * as map from "../map/index.js"; export { type ...} from "../map/index.js";`.
// This way, consumers can write:
// `import { IncrementalMap, map as $IncrementalMap } from "incremental-transforms"`
// and don't need two separate lines to import the type and the value.

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
