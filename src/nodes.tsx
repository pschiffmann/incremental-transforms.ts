import * as $Set from "./util/set";
import * as $Map from "./util/map";
import type { PatchObject } from "./utility-types";
import { process, nodes } from "./globals";
import { ObserverDefinition } from "./observers";
import { Process } from "./process";
import type { HookContext } from "./hooks";

export interface NodeExpando {
  /**
   *
   */
  readonly id: number;

  /**
   *
   */
  hookContext: HookContext<any>;

  /**
   * All connected nodes that have this node in their dependencies.
   */
  readonly consumedBy: Set<TransformNode>;

  /**
   * All observers that have this node in their dependencies.
   */
  readonly observedBy: Set<ObserverDefinition>;
}

export abstract class Node<P = unknown> {
  get connected(): boolean {
    return isConnected(this);
  }

  /**
   * Disconnects this node and all nodes that depend on this from the graph,
   * and terminates all observers on these nodes. If this node is already
   * disconnected, throws an error.
   */
  disconnect() {
    removeNode(this);
  }

  /**
   * Called between the `render` and `effect` phases. Mutates this node to
   * apply `patch` to it.
   */
  abstract _commit(patch: P): void;

  /**
   * Throws an error if this node has not been initialized, or has been
   * disconnected. Should be called by subclasses in any data accessor method.
   */
  protected _assertConnected(): void {
    const expando = nodes.get(this);
    if (!expando) {
      throw new Error("Node is disconnected.");
    } else if (!expando.initialized) {
      throw new Error("Node is not initialized.");
    }
  }
}

/**
 * A source node has no dependencies
 */
export abstract class SourceNode<P = unknown> extends Node<P> {
  protected abstract _createPatch(): P;

  /**
   * Inspired by: https://api.flutter.dev/flutter/widgets/State/setState.html
   */
  protected _setState(callback: (patch: P) => void): void {
    this._assertConnected();
    if (!process.current) {
      const patch = this._createPatch();
      callback(patch);
      process.current = new Process("render");
      process.current.scheduled.set(this, patch);
      process.current.run();
      process.current = null;
    } else {
      switch (process.current.phase) {
        case "transaction":
        case "effect":
        case "observer":
          const patch = $Map.putIfAbsent(process.current.scheduled, this, () =>
            this._createPatch()
          );
          callback(patch);
          break;
        case "render":
          throw new Error("Can't mutate a node from inside a render function.");
        default:
          throw new Error("Unimplemented");
      }
    }
  }
}

/**
 * `D` is the type of `_dependencies`, `P`  is the patch object type.
 */
export abstract class TransformNode<
  D extends {} = {},
  P = unknown,
  K = unknown
> extends Node<P> {
  constructor(readonly _dependencies: D) {
    super();
    // Object.defineProperty(this, "_dependencies", {
    //   value: Object.freeze(dependencies),
    //   configurable: false,
    //   enumerable: false,
    //   writable: false
    // });
  }

  /**
   *
   */
  abstract _render(
    dependencies: PatchObject<D>,
    hookRenderer: HookContext<K>
  ): P;
}

export function isConnected(node: Node): boolean {
  return nodes.has(node);
}

let nextNodeId = 1;

/**
 *
 */
export function _addNode(node: Node, isDirty: boolean = true): void {
  if (node instanceof TransformNode) {
    const duplicates = new Map<Node, string>();
    for (const [name, dependency] of Object.entries<Node>(node._dependencies)) {
      if (!(dependency instanceof Node)) {
        throw new Error(
          `Dependencies must be instances of class Node, but ${name} is a ` +
            `${typeof dependency}.`
        );
      }
      if (!isConnected(dependency)) {
        throw new Error(`Dependency ${name} is not connected.`);
      }
      if (duplicates.has(dependency)) {
        throw new Error(
          `Dependencies ${duplicates.get(dependency)} and ${name} reference ` +
            "the same node."
        );
      }
    }
  }

  // TODO: If `dependencies` is not empty, schedule a render.
  const needsInitialization = Object.keys(node).length !== 0;
  nodes.set(node, {
    id: nextNodeId++,
    initialized: !needsInitialization,
    consumedBy: new Set(),
    observedBy: new Set()
  });
  for (const dependency of Object.values<Node>(node._dependencies)) {
    nodes.get(dependency)!.consumedBy.add(node);
  }
}

/**
 *
 */
export function removeNode(node: Node): void {
  if (!isConnected(node)) throw new Error(`Node is already disconnected.`);

  const disconnectedNodes = new Set([node]);
  const disconnectedObservers = new Set<ObserverDefinition>();
  for (const current of disconnectedNodes) {
    const expando = nodes.get(current)!;
    nodes.delete(current);
    for (const dependency of Object.values<Node>(node._dependencies)) {
      nodes.get(dependency)!.consumedBy.delete(current);
    }
    $Set.addAll(disconnectedNodes, expando.consumedBy);
    $Set.addAll(disconnectedObservers, expando.observedBy);
  }
  for (const observer of disconnectedObservers) {
    for (const dependency of observer.dependencies!) {
      nodes.get(dependency)?.observedBy.delete(observer);
    }
    observer.dependencies = null;
  }
}
