import { connect, disconnect, mutateSourceNode } from "./process";
const nodeExpandos = new WeakMap();
export function getNodeExpando(node) {
  return nodeExpandos.get(node);
}
let nextNodeId = 0;
/**
 *
 */
export class NodeBase {
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
      nodeExpandos.set(this, {
        id,
        consumers: new Set(),
      });
    }
  }
  /**
   * Returns all nodes that have this node as an input and are not suspended.
   */
  get consumers() {
    const consumers = nodeExpandos.get(this).consumers;
    return consumers ? [...consumers] : [];
  }
}
/**
 * A source node has setter methods that can be used to mutate the object
 * directly. It has no dependencies.
 */
export class SourceNode extends NodeBase {
  /**
   * Inspired by: https://api.flutter.dev/flutter/widgets/State/setState.html
   *
   * `callback` may modify the passed-in patch object in place, or return a new
   * value. Returning `null` indicates that `callback` made no changes to this
   * node, or that all previous changes in `patch` have been reverted and
   * consumers no longer need to be re-rendered.
   */
  _setState(callback) {
    mutateSourceNode(this, callback);
  }
}
/**
 * `D` is the type of `dependencies`, `P`  is the patch object type, `K` is the
 * hook context key type.
 */
export class TransformNode extends NodeBase {
  constructor(dependencies) {
    super();
    this.#dependencies = Object.freeze(dependencies);
  }
  #dependencies;
  get dependencies() {
    return this.#dependencies;
  }
  get connected() {
    return !!nodeExpandos.get(this).consumers;
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
  _assertConnected() {
    if (!this.connected) {
      throw new Error("Can't read from disconnected nodes.");
    }
  }
}
