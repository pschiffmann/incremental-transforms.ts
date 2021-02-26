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
  uninitialized: Set<TransformNode>;

  patches: Map<Node, any>;

  /**
   * This map is filled by `executeWithHooks`.
   */
  hookProps: Map<TransformNode, HookPropsMap | null>;
  hookState: Map<TransformNode, Map<number, any>>;
  scheduledEffectCleanups: (() => void)[];
  scheduledEffects: (() => void)[];

  handleError?(error: any): void;
}

function createProcess(handleError?: Process["handleError"]): Process {
  return {
    phase: "mutate",
    uninitialized: new Set(),
    patches: new Map(),
    hookProps: new Map(),
    hookState: new Map(),
    scheduledEffectCleanups: [],
    scheduledEffects: [],
    handleError,
  };
}

let process: Process | null = null;

/**
 *
 */
export function transaction<R>(
  callback: () => R,
  handleError?: (error: any) => void
): R {
  if (process) {
    throw new Error();
  }
  process = createProcess(handleError);
  let result: R;
  mutateNode(() => {
    result = callback();
  });
  return result!;
}

export function mutateSourceNode<P, T extends SourceNode<P>>(
  node: T,
  setStateCallback: (patch: P) => P | null
): void {
  mutateNode(() => {
    const patch = setStateCallback(
      process!.patches.get(node) ?? node._createPatch()
    );
    if (patch) {
      process!.patches.set(node, patch);
    } else {
      process!.patches.delete(node);
    }
  });
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
) {
  if (node.suspended) {
    throw new Error("Can't modify a suspended node.");
  }
  const expando = getNodeExpando(node)!;
  const hookProps = expando.hookProps.get(key)?.[hookIndex];
  if (
    !hookProps ||
    hookProps.type !== "state" ||
    hookProps.setState !== setStateCallback
  ) {
    throw new Error("You used a stale `setState()` callback.");
  }

  mutateNode(() => {
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
  });
}

/**
 * Renders all nodes that whose state changed, and if no errors occured during
 * rendering, commits the changes to the nodes and executes effects. `process`
 * must not be `null` when this method is called.
 */
function mutateNode(callback: () => void): void {
  if (process) {
    switch (process.phase) {
      case "mutate":
        callback();
        return;
      case "render":
      case "commit":
      case "effect":
        throw new Error("Can't call setState() during render or effect phase.");
    }
  }

  process = createProcess();
  try {
    if (process!.patches.size === 0 && process!.hookProps.size === 0) return;
    process!.phase = "render";
    render();
    process!.phase = "commit";
    commit();
    process!.phase = "effect";
    effect();
  } finally {
    process = null;
  }
}

function render() {
  const dirty = new FlatQueue<TransformNode>();
  const discovered = new Set<TransformNode>();
  for (const sourceNode of process!.patches.keys()) {
    for (const consumer of sourceNode.consumers) {
      dirty.push(getNodeExpando(consumer).id, consumer);
    }
  }
  for (const node of process!.hookProps.keys()) {
    dirty.push(nodeIds.get(node)!, node);
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
  for (const [node, patch] of process!.patches) {
    node._commit(patch);
  }
  for (const [node, props] of process!.hookProps) {
    nodeExpandos.get(node)!.hookProps;
  }
}

function effect() {
  const handleError = process!.handleError ?? console.error;
  for (const callback of process!.scheduledEffectCleanups) {
    try {
      callback();
    } catch (e) {
      handleError(e);
    }
  }
  for (const callback of process!.scheduledEffects) {
    try {
      callback();
    } catch (e) {
      handleError(e);
    }
  }
}
