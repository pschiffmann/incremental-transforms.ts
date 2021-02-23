import FlatQueue from "flatqueue";
import { HookStateMap } from "./hooks/context";
import { SetStateCallback } from "./hooks/use-state";
import { Node, nodeIds, SourceNode, TransformNode } from "./nodes";
import * as $Map from "./util/map";

export type ProcessPhase = "mutate" | "render" | "commit" | "effect";

interface Process {
  phase: ProcessPhase;
  patches: Map<Node, any>;
  hookStates: Map<TransformNode, HookStateMap>;
  scheduledEffectCleanups: (() => void)[];
  scheduledEffects: (() => void)[];
}

let process: Process | null = null;

/**
 *
 */
export function transaction<R>(callback: () => R): R {
  beforeMutate();
  try {
    const result = callback();
    run();
    return result;
  } finally {
    process = null;
  }
}

export function mutateSourceNode<T extends SourceNode<any>>(
  node: T,
  setStateCallback: (patch: T extends SourceNode<infer P> ? P : never) => void
): void {
  const runImmediately = beforeMutate();
  const patch = $Map.putIfAbsent(process!.patches, node, () =>
    node._createPatch()
  );
  setStateCallback(patch);
  if (runImmediately) run();
}

export function mutateTransformNode(
  node: Node,
  key: any,
  stateIndex: number,
  newValue: SetStateCallback<any>
) {
  const runImmediately = beforeMutate();
  const hookStatesForNode = $Map.putIfAbsent(
    process!.hookStates,
    node,
    () => new Map()
  );
  const hookStateForKey = $Map.putIfAbsent(hookStatesForNode, key, () => []);
  const context = $Map.putIfAbsent(process!.hookContexts, node, () => ({
    changed: [],
  }));
  context.changed.push(key);
  if (runImmediately) run();
}

/**
 * Checks that a mutation is currently allowed (no process is currently running,
 * or still in "mutate" phase"). Creates a new process if necessary. Returns
 * `true` if a new process was created and should `run()` directly after the
 * mutation.
 */
function beforeMutate(): boolean {
  if (process) {
    switch (process.phase) {
      case "mutate":
        return false;
      case "render":
      case "commit":
      case "effect":
        throw new Error("Can't call setState() during render or effect phase.");
    }
  } else {
    process = {
      phase: "mutate",
      patches: new Map(),
      hookContexts: new Map(),
    };
    return true;
  }
}

/**
 * Renders all nodes that whose state changed, and if no errors occured during
 * rendering, commits the changes to the nodes and executes effects. `process`
 * must not be `null` when this method is called.
 */
function run() {
  try {
    if (process!.patches.size === 0 && process!.hookContexts.size === 0) return;
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
      dirty.push(nodeIds.get(consumer)!, consumer);
    }
  }
  for (const node of process!.hookContexts.keys()) {
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
    const patch = node._render(deps, null);
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
  for (const [node, hookContext] of process!.hookContexts) {
  }
}

function effect() {}
