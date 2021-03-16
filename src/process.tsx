import FlatQueue from "flatqueue";
import { executeWithHooks, HookPropsMap } from "./hooks/context";
import { getNodeExpando, Node, SourceNode, TransformNode } from "./nodes";
import * as $Map from "./util/map";

export type ProcessPhase = "mutate" | "render" | "commit" | "effect";

interface Process {
  phase: ProcessPhase;

  /**
   * Nodes that have been connected and must now be initialized.
   */
  connected: Set<TransformNode>;

  /**
   * Nodes that have been disconnected and must now be cleaned up.
   */
  disconnected: Set<TransformNode>;

  /**
   * Stores the patches created by `SourceNode._createPatch()`/
   * `SourceNode._setState()` and `TransformNode._initialize()`/
   * `TransformNode._render()`.
   */
  patches: Map<Node, any>;

  /**
   * This map is filled by `executeWithHooks`.
   */
  hookProps: Map<TransformNode, HookPropsMap | null>;
  hookState: Map<TransformNode, Map<number, any>>;
  scheduledEffectCleanups: (() => void)[];
  scheduledEffects: (() => void)[];

  /**
   *
   */
  onError(error: any): void;
}

let process: Process | null = null;

export function transaction<R>(
  callback: () => R,
  onError: Process["onError"] = console.error
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

export declare namespace transaction {
  const inProgress: boolean;
}

Object.defineProperty(transaction, "inProgress", {
  get() {
    return !!process;
  },
});

/**
 *
 */
function assertMutatePhase(): void {
  switch (process!.phase) {
    case "render":
    case "commit":
    case "effect":
      throw new Error("Can't call setState() during render or effect phase.");
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
  const patch = setStateCallback(patches.get(node) ?? node._createPatch());
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
  setStateCallback: any,
  stateIndex: number,
  value: T | ((previous: T) => T)
): void {
  if (!process) {
    return transaction(() =>
      mutateTransformNode(
        node,
        key,
        hookIndex,
        setStateCallback,
        stateIndex,
        value
      )
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

  const lastHookState = expando.hookState.get(key)!;
  let nextHookState = process!.hookState.get(node);

  let nextValue: T;
  if (value instanceof Function) {
    const lastValue =
      nextHookState && nextHookState.has(stateIndex)
        ? nextHookState.get(stateIndex)
        : lastHookState[stateIndex];
    nextValue = value(lastValue);
  } else {
    nextValue = value;
  }

  if (Object.is(nextValue, lastHookState[stateIndex])) {
    if (nextHookState) {
      nextHookState.delete(stateIndex);
      if (nextHookState.size === 0) process!.hookState.delete(node);
    }
  } else {
    if (!nextHookState) {
      nextHookState = new Map();
      process!.hookState.set(node, nextHookState);
    }
    nextHookState.set(stateIndex, nextValue);
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
 *
 */
function render() {
  process!.phase = "render";
  const dirty = new FlatQueue<TransformNode>();
  const discovered = new Set<TransformNode>();
  for (const sourceNode of process!.patches.keys()) {
    for (const consumer of sourceNode.consumers) {
      dirty.push(getNodeExpando(consumer).id, consumer);
    }
  }
  for (const node of process!.hookProps.keys()) {
    dirty.push(getNodeExpando(node).id, node);
  }
  for (;;) {
    const node = dirty.peekValue();
    if (!node) break;
    dirty.pop();

    const deps: any = {};
    for (const [name, dep] of Object.entries(node.dependencies) as any) {
      if (process!.patches.has(dep)) {
        deps[name] = process!.patches.get(dep);
      }
    }
    const nextHookProps = $Map.putIfAbsent(
      process!.hookProps,
      node,
      () => new Map()
    );
    const patch = node._render(
      deps,
      new Set(nextHookProps.keys()),
      executeWithHooks.bind(
        null,
        node,
        hookProps.get(node)!,
        nextHookProps,
        process!.scheduledEffectCleanups,
        process!.scheduledEffects
      ) as any
    );
    if (patch !== null) {
      process!.patches.set(node, patch);
      for (const consumer of node.consumers) {
        if (!discovered.has(consumer)) {
          discovered.add(consumer);
          dirty.push(nodeIds.get(consumer)!, consumer);
        }
      }
    }
  }
}

function commit() {
  process!.phase = "commit";
  for (const [node, patch] of process!.patches) {
    node._commit(patch);
  }
  for (const [node, props] of process!.hookProps) {
    nodeExpandos.get(node)!.hookProps;
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
}
