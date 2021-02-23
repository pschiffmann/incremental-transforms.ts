import { HookPropsMap, HookStateMap } from "./hooks/context";
import { mutateSourceNode } from "./process";
import type { PatchObject } from "./utility-types";

/**
 *
 */
export const nodeIds = new WeakMap<Node, number>();
let nextNodeId = 0;

/**
 *
 */
export const consumers = new WeakMap<Node, Set<TransformNode>>();

export const hookProps = new WeakMap<TransformNode, HookPropsMap>();
export const hookState = new WeakMap<TransformNode, HookStateMap>();

/**
 *
 */
export abstract class Node<P = unknown> {
  constructor() {
    nodeIds.set(this, nextNodeId++);
    consumers.set(this, new Set());
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
    for (const consumer of consumers.get(this)!) {
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
    return [...consumers.get(this)!];
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
    hookProps.set(this, new Map());
    hookState.set(this, new Map());
    this.#dependencies = Object.freeze(dependencies);
  }

  #dependencies: D;

  get dependencies() {
    return this.#dependencies;
  }

  suspend() {
    if (this.suspended) return;
    for (const dependency of Object.values(this.#dependencies) as Node[]) {
      consumers.get(dependency)!.delete(this);
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
      consumers.get(dependency)!.add(this);
    }
    super.resume();
    try {
      // TODO: process.run()
    } catch (e) {
      this.suspend();
      throw e;
    }
  }

  /**
   *
   */
  abstract _render(
    dependencies: PatchObject<D>,
    dirtyKeys: Set<K>,
    hookRenderer: <R>(key: K, callback: () => R) => R
  ): P;
}
