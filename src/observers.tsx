import { nodes } from "./globals";
import { Node, isConnected } from "./nodes";

export interface ObserverDefinition {
  readonly callback: () => void;
  readonly phase: "effect" | "observer";

  /**
   * This observer is informed whenever a dependency changes.
   *
   * This property is set to `null` when the first dependency is disconnected
   * to make the disconnected nodes available for garbage collection.
   */
  dependencies: Set<Node> | null;
}

/**
 * Adds `observer`
 */
export function _addObserver(
  callback: () => void,
  dependencies: Iterable<Node>,
  phase: "effect" | "observer" = "observer"
): () => void {
  let definition: ObserverDefinition | null = {
    callback,
    phase,
    dependencies: new Set(dependencies)
  };
  for (const dependency of definition.dependencies!) {
    if (!isConnected(dependency)) {
      throw new Error(`Dependency is not connected.`);
    }
  }
  for (const dependency of definition.dependencies!) {
    nodes.get(dependency)!.observedBy.add(definition);
  }
  return () => {
    if (definition === null) {
      throw new Error(`Observer has already been terminated.`);
    }
    if (definition.dependencies) {
      for (const dependency of definition.dependencies) {
        nodes.get(dependency)!.observedBy.delete(definition);
      }
    }
    definition = null;
  };
}
