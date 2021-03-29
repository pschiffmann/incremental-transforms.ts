import { HookPropsMap, HookStateMap } from "./hooks";
import type { PatchObject } from "./utility-types";
export declare type Node = SourceNode | TransformNode;
export declare type HookRenderer<K = unknown> = <R>(
  key: K,
  callback?: () => R
) => R;
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
export declare function getNodeExpando(node: SourceNode): SourceNodeExpando;
export declare function getNodeExpando(
  node: TransformNode
): TransformNodeExpando;
/**
 *
 */
export declare abstract class NodeBase<P = unknown> {
  constructor();
  /**
   * Returns all nodes that have this node as an input and are not suspended.
   */
  get consumers(): TransformNode[];
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
export declare abstract class SourceNode<P = unknown> extends NodeBase<P> {
  /**
   * Inspired by: https://api.flutter.dev/flutter/widgets/State/setState.html
   *
   * `callback` may modify the passed-in patch object in place, or return a new
   * value. Returning `null` indicates that `callback` made no changes to this
   * node, or that all previous changes in `patch` have been reverted and
   * consumers no longer need to be re-rendered.
   */
  protected _setState(callback: (patch?: P) => P | null): void;
}
/**
 * `D` is the type of `dependencies`, `P`  is the patch object type, `K` is the
 * hook context key type.
 */
export declare abstract class TransformNode<
  D extends {} = {},
  P = unknown,
  K = unknown
> extends NodeBase<P> {
  #private;
  constructor(dependencies: D);
  get dependencies(): D;
  get connected(): boolean;
  /**
   * Connects this node to its `dependencies`. If the node is already
   * `connected` or any dependency is not connected, does nothing.
   */
  connect(): void;
  /**
   * Disconnects this node from its `dependencies`. All consumers of this node
   * are disconnected as well. If this node is not `connected`, does nothing.
   */
  disconnect(): void;
  /**
   * Throws an error if this node has not been initialized, or has been
   * disconnected. Should be called by subclasses in any data accessor method.
   */
  protected _assertConnected(): void;
  /**
   *
   */
  abstract _initialize(
    dependencies: PatchObject<D>,
    hookRenderer: HookRenderer<K>
  ): P;
  /**
   * Called during the `commit` phase after this node has been disconnected.
   */
  abstract _clear(): void;
  /**
   * Calling `hookRenderer` without a callback marks the key as removed and runs
   * all cleanup effects.
   */
  abstract _render(
    dependencies: PatchObject<D>,
    dirtyKeys: Set<K>,
    hookRenderer: HookRenderer<K>
  ): P | null;
}
