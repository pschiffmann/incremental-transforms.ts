import { HookPropsMap, HookStateMap } from "./hooks/context";
import { connect, disconnect, mutateSourceNode } from "./process";
import type { PatchObject } from "./utility-types";

export interface NodeExpando {
  readonly id: number;

  /**
   * If this value is `null`, then the node is disconnected.
   */
  consumers: Set<TransformNode> | null;
}

export interface TransformNodeExpando extends NodeExpando {
  readonly hookProps: HookPropsMap;
  readonly hookState: HookStateMap;
}

/**
 * Only exported for use in module `../nodes.tsx`.
 */
const nodeExpandos = new WeakMap<Node, NodeExpando | TransformNodeExpando>();

export function getNodeExpando(node: SourceNode): NodeExpando;
export function getNodeExpando(node: TransformNode): TransformNodeExpando;
export function getNodeExpando(node: Node) {
  return nodeExpandos.get(node);
}

let nextNodeId = 0;

/**
 *
 */
export abstract class Node<P = unknown> {
  constructor() {
    const id = nextNodeId++;
    if (this instanceof TransformNode) {
      nodeExpandos.set(this, {
        id,
        consumers: null,
        hookProps: new Map(),
        hookState: new Map(),
      });
    } else {
      nodeExpandos.set(this, { id, consumers: new Set<TransformNode>() });
    }
  }

  /**
   * Returns all nodes that have this node as an input and are not suspended.
   */
  get consumers(): TransformNode[] {
    const consumers = nodeExpandos.get(this)!.consumers;
    return consumers ? [...consumers] : [];
  }

  /**
   * Called between the `render` and `effect` phases. Mutates this node to
   * apply `patch` to it.
   */
  abstract _commit(patch: P): void;
}

/**
 * A source node has setter methods that can be used to mutate the object
 * directly. It has no dependencies.
 */
export abstract class SourceNode<P = unknown> extends Node<P> {
  /**
   * Returns an empty patch object that is then modified by `_setState()`
   * callbacks.
   */
  abstract _createPatch(): P;

  /**
   * Inspired by: https://api.flutter.dev/flutter/widgets/State/setState.html
   *
   * `callback` may modify the passed-in patch object in place, or return a new
   * value. Returning `null` indicates that `callback` made no changes to this
   * node, or that all previous changes in `patch` have been reverted and
   * consumers no longer need to be re-rendered.
   */
  protected _setState(callback: (patch: P) => P | null): void {
    mutateSourceNode(this, callback);
  }
}

/**
 * `D` is the type of `dependencies`, `P`  is the patch object type, `K` is the
 * hook context key type.
 */
export abstract class TransformNode<
  D extends {} = {},
  P = unknown,
  K = unknown
> extends Node<P> {
  constructor(dependencies: D) {
    super();
    this.#dependencies = Object.freeze(dependencies);
  }

  #dependencies: D;

  get dependencies(): D {
    return this.#dependencies;
  }

  get connected(): boolean {
    return !!nodeExpandos.get(this)!.consumers;
  }

  connect() {
    connect(this);
  }

  disconnect() {
    disconnect(this);
  }

  /**
   * Throws an error if this node has not been initialized, or has been
   * disconnected. Should be called by subclasses in any data accessor method.
   */
  protected _assertConnected(): void {
    if (!this.connected) {
      throw new Error("Can't read from disconnected nodes.");
    }
  }

  /**
   *
   */
  abstract _initialize(hookRenderer: <R>(key: K, callback?: () => R) => R): P;

  /**
   *
   */
  abstract _clear(): void;

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  abstract _render(
    dependencies: PatchObject<D>,
    dirtyKeys: Set<K>,
    hookRenderer: <R>(key: K, callback?: () => R) => R
  ): P | null;
}
