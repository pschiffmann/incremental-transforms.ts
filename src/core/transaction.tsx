import FlatQueue from "flatqueue";
import * as $Map from "../util/map.js";
import { createHookRenderer, HookProps, SetStateCallback } from "./hooks.js";
import { getNodeExpando, Node, SourceNode, TransformNode } from "./nodes.js";

export type ErrorHandler = (error: any) => void;

export type OnCommitCallback = (e: {
  readonly connected: Set<TransformNode>;
  readonly disconnected: Set<TransformNode>;
  readonly changed: Set<Node>;
}) => void;

interface Process {
  /**
   * A transaction goes through the phases in order mutate -> render -> commit
   * -> effect, or exits prematurely, but never goes back to a completed phase.
   */
  phase: "mutate" | "render" | "commit" | "effect";

  /**
   * Nodes that have been connected and must now be initialized.
   *
   * While the `transaction()` callback is running during the `mutate` phase,
   * this contains all nodes on which `TransformNode.connect()` has been called.
   * After the callback returns, all nodes are removed from this set that can't
   * be connected, so during the `render` phase, it contains only the nodes that
   * must actually be connected.
   *
   * The nodes in this set are initialized by `render()`.
   */
  connected: Set<TransformNode>;

  /**
   * Nodes that have been disconnected and must now be cleaned up.
   *
   * While the `transaction()` callback is running during the `mutate` phase,
   * this contains all nodes on which `TransformNode.disconnect()` has been
   * called. After the callback returns, all transitive consumers of the nodes
   * in this set are added, so during the `render` phase, it contains all nodes
   * that must actually be disconnected.
   *
   * The cleanup is done by `commit()`.
   */
  disconnected: Set<TransformNode>;

  /**
   * Stores the patches created by `SourceNode._createPatch()`/
   * `SourceNode._setState()` and `TransformNode._initialize()`/
   * `TransformNode._render()`.
   *
   * During the `mutate` phase, this is filled with `SourceNode` keys by
   * `mutateSourceNode()`. During the `render` phase, `TransformNode` keys are
   * added. All patches are passed to `NodeBase._commit()` during the `commit`
   * phase.
   */
  patches: Map<Node, any>;

  /**
   * Filled during the `render` phase by `executeWithHooks()`. Contains changed
   * hook props, by hook renderer key, by node. If a value is `null`, then that
   * key has been unmounted and can be removed.
   *
   * The values are merged into `nodeExpandos` during the `commit` phase.
   */
  hookProps: Map<TransformNode, Map<any, HookProps[] | null>>;

  /**
   * Filled during the `mutate` phase by `mutateTransformNode()`. Contains the
   * new `useState()` values, by hook index, by hook renderer key, by node.
   *
   * The values are read by `executeWithHooks()` during the `render` phase, and
   * written to `nodeExpandos` during the `commit` phase.
   */
  hookState: Map<TransformNode, Map<any, Map<number, any>>>;

  /**
   * Contains the
   */
  scheduledEffectCleanups: (() => void)[];
  scheduledEffects: (() => void)[];

  /**
   *
   */
  onError: ErrorHandler;
}

let process: Process | null = null;

const onCommit = new Set<OnCommitCallback>();

export function transaction<R>(
  callback: () => R,
  onError: ErrorHandler = console.error
): R {
  if (process) {
    throw new Error("Calls to `transaction()` can't be nested.");
  }
  process = {
    phase: "mutate",
    connected: new Set(),
    disconnected: new Set(),
    patches: new Map(),
    hookProps: new Map(),
    hookState: new Map(),
    scheduledEffectCleanups: [],
    scheduledEffects: [],
    onError,
  };
  try {
    const result = callback();
    resolveConnectedDisconnected();
    if (
      process.patches.size !== 0 ||
      process.hookProps.size !== 0 ||
      process.hookState.size !== 0 ||
      process.connected.size !== 0 ||
      process.disconnected.size !== 0
    ) {
      render();
      commit();
      effect();
    }
    return result;
  } finally {
    process = null;
  }
}

export declare namespace transaction {
  const inProgress: boolean;

  function on(type: "commit", callback: OnCommitCallback): void;
  function on(type: "abort", callback: (error: any) => void): void;
  function on(type: "effect-error", callback: (error: any) => void): void;

  function off(type: "commit", callback: OnCommitCallback): void;
  function off(type: "abort", callback: (error: any) => void): void;
  function off(type: "effect-error", callback: (error: any) => void): void;
}

Object.defineProperties(transaction, {
  inProgress: {
    get() {
      return !!process;
    },
  },
  on: {
    get() {
      return on;
    },
  },
  off: {
    get() {
      return off;
    },
  },
});

function on(
  event: "commit" | "abort" | "effecterror",
  callback: () => void
): void {
  switch (event) {
    case "commit":
      onCommit.add(callback);
      break;
    default:
      throw new Error("Unimplemented");
  }
}

function off(
  event: "commit" | "abort" | "effecterror",
  callback: () => void
): void {
  switch (event) {
    case "commit":
      onCommit.delete(callback);
      break;
    default:
      throw new Error("Unimplemented");
  }
}

/**
 *
 */
function assertMutatePhase(): void {
  switch (process!.phase) {
    case "render":
      throw new Error("Renders must be side-effect free.");
    case "commit":
      throw new Error(
        "`Node._commit()` must not have any side-effects outside of the node " +
          "itself."
      );
    case "effect":
      throw new Error("Effects must not synchronously mutate nodes.");
  }
}

/**
 *
 */
export function mutateSourceNode<P, T extends SourceNode<P>>(
  node: T,
  setStateCallback: (patch: P) => P | null
): void {
  if (!process) {
    return transaction(() => mutateSourceNode(node, setStateCallback));
  }
  assertMutatePhase();

  const { patches } = process;
  const patch = setStateCallback(patches.get(node));
  if (patch) {
    patches.set(node, patch);
  } else {
    patches.delete(node);
  }
}

/**
 * `setStateCallback` is only used to verify that the call has not been made
 * through a stale reference.
 */
export function mutateTransformNode<T>(
  node: TransformNode,
  key: any,
  hookIndex: number,
  setStateCallback: SetStateCallback<T>,
  value: Parameters<SetStateCallback<T>>[0]
): void {
  if (!process) {
    return transaction(() =>
      mutateTransformNode(node, key, hookIndex, setStateCallback, value)
    );
  }
  assertMutatePhase();

  const expando = getNodeExpando(node);
  const hookProps = expando.hookProps.get(key)?.[hookIndex];
  if (
    !hookProps ||
    hookProps.type !== "state" ||
    hookProps.setState !== setStateCallback
  ) {
    throw new Error("You used a stale `setState()` callback.");
  }
  const preTransactionValue = expando.hookState.get(key)!.get(hookIndex);
  const newValue =
    value instanceof Function
      ? value(
          $Map.deepGetOrFallback(
            process.hookState,
            node,
            key,
            hookIndex,
            preTransactionValue
          )
        )
      : value;
  if (Object.is(newValue, preTransactionValue)) {
    $Map.deepDelete(process.hookState, node, key, hookIndex);
  } else {
    $Map.deepSet(process.hookState, node, key, hookIndex, newValue);
  }
}

/**
 *
 */
export function connect(node: TransformNode): void {
  if (!process) {
    return transaction(() => connect(node));
  }
  assertMutatePhase();

  process.connected.add(node);
  process.disconnected.delete(node);
}

/**
 *
 */
export function disconnect(node: TransformNode): void {
  if (!process) {
    return transaction(() => disconnect(node));
  }
  assertMutatePhase();

  process.connected.delete(node);
  process.disconnected.add(node);
}

/**
 * Updates `process.connected` and `process.disconnected`. Finds all transitive
 * consumers of disconnected nodes, adds them to `disconnected`, and removes
 * them from `connected`. Removes all
 */
function resolveConnectedDisconnected() {
  const { connected, disconnected } = process!;
  for (const node of disconnected) {
    const consumers = getNodeExpando(node).consumers;
    if (!consumers) {
      // Was already disconnected before.
      disconnected.delete(node);
      continue;
    }
    for (const consumer of consumers) {
      disconnected.add(consumer);
      connected.delete(consumer);
    }
  }

  // Process in creation order because a node does not get connected if any
  // dependency is disconnected, _except_ if that dependency also gets connected
  // in the same transaction.
  const queue = new FlatQueue<TransformNode>();
  for (const node of connected) {
    queue.push(node, getNodeExpando(node).id);
  }
  for (;;) {
    const node = queue.pop();
    if (!node) break;
    const dependencies = Object.values<Node>(node.dependencies);
    const dependenciesConnected = dependencies.every(
      (dep) =>
        dep instanceof SourceNode ||
        (node.connected && !disconnected.has(node)) ||
        connected.has(node)
    );
    if (!dependenciesConnected) connected.delete(node);
  }
}

/**
 *
 */
function render() {
  process!.phase = "render";
  const {
    connected,
    patches,
    hookProps,
    hookState,
    scheduledEffectCleanups,
    scheduledEffects,
  } = process!;

  // `dirty` contains all nodes that must be rendered, in render order.
  const dirty = new FlatQueue<TransformNode>();
  const discovered = new Set<TransformNode>();
  function enqueue(node: TransformNode) {
    if (discovered.has(node)) return;
    dirty.push(node, getNodeExpando(node).id);
    discovered.add(node);
  }

  // Initialize `dirty` with all nodes that have been mutated or connected.
  for (const sourceNode of patches.keys()) {
    const consumers = getNodeExpando(sourceNode as SourceNode).consumers!;
    for (const consumer of consumers) {
      enqueue(consumer);
    }
  }
  for (const node of hookState.keys()) {
    enqueue(node);
  }
  for (const node of connected) {
    enqueue(node);
  }

  // Process one element of `dirty` per iteration, render that node and enqueue
  // all its consumers.
  for (;;) {
    const node = dirty.pop();
    if (!node) break;
    const expando = getNodeExpando(node);

    // Build patch object from dirty dependencies.
    const deps = new Map<string, any>();
    for (const [name, dep] of Object.entries<Node>(node.dependencies)) {
      const patch = patches.get(dep);
      if (patch) deps.set(name, patch);
    }

    const hookStatePatch = $Map.putIfAbsent(hookState, node, () => new Map());
    // Render `node`.
    const { hookRenderer, newHookProps, effectCleanups, effects } =
      createHookRenderer(
        node,
        expando.hookProps,
        expando.hookState,
        hookStatePatch
      );
    const patch = connected.has(node)
      ? node._initialize(deps, hookRenderer)
      : node._render(deps, new Set(hookStatePatch.keys()), hookRenderer);
    if (patch) {
      patches.set(node, patch);
      // `consumers` is `null` if `node` is in `connected`.
      // We don't need to handle newly connected nodes that have `node` in their
      // dependencies because they are enqueued already.
      expando.consumers?.forEach(enqueue);
    }
    // `hookRenderer` holds references to `nextHookProps`, `effectCleanups`  and
    // `effects` and fills them when it is called by
    // `TransformNode._initialize()` or `TransformNode._render()`.
    hookProps.set(node, newHookProps);
    scheduledEffectCleanups.push(...effectCleanups);
    scheduledEffects.push(...effects);
  }
}

function commit() {
  process!.phase = "commit";
  for (const [node, patch] of process!.patches) {
    node._commit(patch);
  }
  for (const [node, propsPatch] of process!.hookProps) {
    const { hookProps, hookState } = getNodeExpando(node);
    for (const [key, props] of propsPatch) {
      if (props) {
        hookProps.set(key, props);
      } else {
        hookProps.delete(key);
        hookState.delete(key);
      }
    }
  }
  for (const [node, statePatch] of process!.hookState) {
    const { hookState } = getNodeExpando(node);
    for (const [key, patch] of statePatch) {
      const keyState = hookState.get(key);
      keyState ? $Map.setAll(keyState, patch) : hookState.set(key, patch);
    }
  }
  for (const node of process!.connected) {
    getNodeExpando(node).consumers = new Set();
  }
  for (const node of process!.connected) {
    for (const dependency of Object.values<any /* Node */>(node.dependencies)) {
      getNodeExpando(dependency).consumers.add(node);
    }
  }
  for (const node of process!.disconnected) {
    getNodeExpando(node).consumers = null;
  }
  for (const node of process!.disconnected) {
    for (const dependency of Object.values<any /* Node */>(node.dependencies)) {
      getNodeExpando(node).consumers?.delete(node);
    }
  }
}

function effect() {
  process!.phase = "effect";
  const { scheduledEffectCleanups, scheduledEffects, onError } = process!;
  for (const callback of scheduledEffectCleanups) {
    try {
      callback();
    } catch (e) {
      onError(e);
    }
  }
  for (const callback of scheduledEffects) {
    try {
      callback();
    } catch (e) {
      onError(e);
    }
  }

  const onCommitInfo = {
    connected: process!.connected,
    disconnected: process!.disconnected,
    changed: new Set(process!.patches.keys()),
  };
  for (const callback of onCommit) {
    try {
      callback(onCommitInfo);
    } catch (e) {
      console.error("Error in transaction.oncommit callback", e);
    }
  }
}
