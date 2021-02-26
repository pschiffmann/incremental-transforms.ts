import { HookPropsMap, HookStateMap } from "./hooks/context";
import { mutateSourceNode } from "./process";
import type { PatchObject } from "./utility-types";

const nodeExpandos = new WeakMap<Node, NodeExpando | TransformNodeExpando>();

export function getNodeExpando(node: SourceNode): NodeExpando;
export function getNodeExpando(node: TransformNode): TransformNodeExpando;
export function getNodeExpando(node: Node) {
  return nodeExpandos.get(node);
}

export interface NodeExpando {
  readonly id: number;
  readonly consumers: Set<TransformNode>;
}

export interface TransformNodeExpando extends NodeExpando {
  readonly hookProps: HookPropsMap;
  readonly hookState: HookStateMap;
}

let nextNodeId = 0;

/**
 *
 */
export abstract class Node<P = unknown> {
  constructor() {
    const id = nextNodeId++;
    const consumers = new Set<TransformNode>();
    if (this instanceof TransformNode) {
      nodeExpandos.set(this, {
        id,
        consumers,
        hookProps: new Map(),
        hookState: new Map(),
      });
    } else {
      nodeExpandos.set(this, { id, consumers });
    }
  }

  #suspended = true;

  get suspended(): boolean {
    return this.#suspended;
  }

  /**
   * Suspends this node and all transitive `consumers`.
   */
  suspend(): void {
    this.#suspended = true;
    for (const consumer of nodeExpandos.get(this)!.consumers) {
      consumer.suspend();
    }
  }

  /**
   * Resumes this node, but doesn't resume any of its `consumers`.
   */
  resume(): void {
    this.#suspended = false;
  }

  /**
   * Returns all nodes that have this node as an input and are not suspended.
   */
  get consumers(): TransformNode[] {
    return [...nodeExpandos.get(this)!.consumers];
  }

  /**
   * Throws an error if this node has not been initialized, or has been
   * disconnected. Should be called by subclasses in any data accessor method.
   */
  protected _assertNotSuspended(): void {
    if (this.#suspended) {
      throw new Error("Can't read from suspended nodes.");
    }
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
    this._assertNotSuspended();
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

  get dependencies() {
    return this.#dependencies;
  }

  // TODO: Rename to "disconnect", run all effect cleanups
  suspend() {
    if (this.suspended) return;
    for (const dependency of Object.values(this.#dependencies) as Node[]) {
      nodeExpandos.get(dependency)!.consumers.delete(this);
    }
    super.suspend();
  }

  resume() {
    if (!this.suspended) return;
    if (process !== null) {
      throw new Error("Can't resume inside a transaction.");
    }
    const dependencies: Node[] = Object.values(this.#dependencies);
    for (const dependency of dependencies) {
      if (dependency.suspended) {
        throw new Error(
          "Can't resume this node because one of its dependencies is "
        );
      }
    }
    for (const dependency of dependencies) {
      nodeExpandos.get(dependency)!.consumers.add(this);
    }
    super.resume();
    try {
      // TODO: process.run()
    } catch (e) {
      this.suspend();
      throw e;
    }
  }

  abstract _initialize(
    hookRenderer: <R>(key: K, callback?: () => R) => R
  ): void;

  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  abstract _render(
    dependencies: PatchObject<D>,
    dirtyKeys: Set<K>,
    hookRenderer: <R>(key: K, callback?: () => R) => R
  ): P;
}
