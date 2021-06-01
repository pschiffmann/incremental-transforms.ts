import { HookPropsMap, HookStateMap } from "./hooks";
import { connect, disconnect, mutateSourceNode } from "./transaction";

export type HookRenderer<K = unknown> = <R>(key: K, callback?: () => R) => R;

export interface SourceNodeExpando {
  readonly id: number;
  readonly consumers: Set<TransformNode>;
}

export interface TransformNodeExpando {
  readonly id: number;

  /**
   * If this value is `null`, then the node is disconnected.
   */
  consumers: Set<TransformNode> | null;
  readonly hookProps: HookPropsMap;
  readonly hookState: HookStateMap;
}

const nodeExpandos = new WeakMap<
  Node,
  SourceNodeExpando | TransformNodeExpando
>();

export function getNodeExpando(node: SourceNode): SourceNodeExpando;
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
      nodeExpandos.set((this as unknown) as SourceNode, {
        id,
        consumers: new Set(),
      });
    }
  }

  /**
   * Returns all nodes that have this node as an input and are not suspended.
   */
  get consumers(): TransformNode[] {
    const consumers = nodeExpandos.get((this as unknown) as Node)!.consumers;
    return consumers ? [...consumers] : [];
  }

  /**
   * Called between the `render` and `effect` phases. Mutates this node to
   * apply `patch` to it.
   */
  abstract _commit(patch: P): void;

  // on(type: "change", callback: () => void): void;
  // on(type: "connect", callback: () => void): void;
  // on(type: "disconnect", callback: () => void): void;
  // on(type, callback): void {}
}

/**
 * A source node has setter methods that can be used to mutate the object
 * directly. It has no dependencies.
 */
export abstract class SourceNode<P = unknown> extends Node<P> {
  /**
   * Inspired by: https://api.flutter.dev/flutter/widgets/State/setState.html
   *
   * `callback` may modify the passed-in patch object in place, or return a new
   * value. Returning `null` indicates that `callback` made no changes to this
   * node, or that all previous changes in `patch` have been reverted and
   * consumers no longer need to be re-rendered.
   */
  protected _setState(callback: (patch?: P) => P | null): void {
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

  /**
   * Connects this node to its `dependencies`. If the node is already
   * `connected` or any dependency is not connected, does nothing.
   */
  connect() {
    connect(this);
  }

  /**
   * Disconnects this node from its `dependencies`. All consumers of this node
   * are disconnected as well. If this node is not `connected`, does nothing.
   */
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
  abstract _initialize(
    patches: Map<string, unknown>,
    hookRenderer: HookRenderer<K>
  ): P | null;

  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  abstract _clear(): void;

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  abstract _render(
    patches: Map<string, unknown>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): P | null;
}

/**
 * Creates a type with the same keys as `D`, but converts each node type to its
 * patch type. All values in `D` must be `Node`s.
 */
export declare type PatchObject<D extends {}> = {
  [K in keyof D]: ExtractPatchType<D[K]>;
};

/**
 * If `T` is a `Node`, resolves its `P` type parameter.
 */
export declare type ExtractPatchType<T> = T extends SourceNode<infer P>
  ? P
  : T extends TransformNode<any, infer P, any>
  ? P
  : never;
