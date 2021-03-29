import FlatQueue from "flatqueue";
import { createHookRenderer } from "./hooks";
import { getNodeExpando, SourceNode } from "./nodes";
import * as $Map from "../util/map";
let process = null;
export function transaction(callback, onError = console.error) {
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
Object.defineProperty(transaction, "inProgress", {
  get() {
    return !!process;
  },
});
/**
 *
 */
function assertMutatePhase() {
  switch (process.phase) {
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
export function mutateSourceNode(node, setStateCallback) {
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
export function mutateTransformNode(
  node,
  key,
  hookIndex,
  setStateCallback,
  value
) {
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
  const preTransactionValue = expando.hookState.get(key).get(hookIndex);
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
export function connect(node) {
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
export function disconnect(node) {
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
  const { connected, disconnected } = process;
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
  const queue = new FlatQueue();
  for (const node of connected) {
    queue.push(getNodeExpando(node).id, node);
  }
  for (;;) {
    const node = queue.peekValue();
    if (!node) break;
    const dependencies = Object.values(node.dependencies);
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
  process.phase = "render";
  const {
    connected,
    patches,
    hookProps,
    hookState,
    scheduledEffectCleanups,
    scheduledEffects,
  } = process;
  // `dirty` contains all nodes that must be rendered, in render order.
  const dirty = new FlatQueue();
  const discovered = new Set();
  function enqueue(node) {
    if (discovered.has(node)) return;
    dirty.push(getNodeExpando(node).id, node);
    discovered.add(node);
  }
  // Initialize `dirty` with all nodes that have been mutated or connected.
  for (const sourceNode of patches.keys()) {
    const consumers = getNodeExpando(sourceNode).consumers;
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
    const node = dirty.peekValue();
    if (!node) break;
    dirty.pop();
    const expando = getNodeExpando(node);
    // Build patch object from dirty dependencies.
    const deps = {};
    for (const [name, dep] of Object.entries(node.dependencies)) {
      const patch = patches.get(dep);
      if (patch) deps[name] = patch;
    }
    // Render `node`.
    const {
      hookRenderer,
      newHookProps,
      effectCleanups,
      effects,
    } = createHookRenderer(
      node,
      expando.hookProps,
      expando.hookState,
      hookState.get(node) ?? null
    );
    const patch = connected.has(node)
      ? node._initialize(deps, hookRenderer)
      : node._render(deps, new Set(hookState.get(node)?.keys()), hookRenderer);
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
  process.phase = "commit";
  for (const [node, patch] of process.patches) {
    node._commit(patch);
  }
  for (const [node, propsPatch] of process.hookProps) {
    const { hookProps } = getNodeExpando(node);
    for (const [key, props] of propsPatch) {
      if (props) {
        hookProps.set(key, props);
      } else {
        hookProps.delete(key);
      }
    }
  }
  for (const [node, statePatch] of process.hookState) {
    const { hookState } = getNodeExpando(node);
    for (const [key, patch] of statePatch) {
      if (patch) {
        const keyState = hookState.get(key);
        for (const [index, state] of patch) {
          keyState.set(index, state);
        }
      } else {
        hookState.delete(key);
      }
    }
  }
}
function effect() {
  process.phase = "effect";
  const { scheduledEffectCleanups, scheduledEffects, onError } = process;
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
}
