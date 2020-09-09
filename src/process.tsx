import { SourceNode, Node, TransformNode } from "./nodes";
import type { ObserverDefinition } from "./observers";
import { process, nodes } from "./globals";
import Queue from "flatqueue";
import { HookContext } from "./hooks";

export type ProcessPhase = "transaction" | "render" | "effect" | "observer";

export class Process {
  constructor(phase: ProcessPhase) {
    this.phase = phase;
  }

  public phase: ProcessPhase | null;

  /**
   * Map from `SourceNode<P>` to patch `P` for that node. All
   * `SourceNode._setState()` (and later `useState()` hooks) add their patches
   * to this map. After the transaction callback returns or the current
   * effect phase ends, a new render phase starts where all scheduled nodes
   * are rendered.
   */
  scheduled = new Map<SourceNode, any>();

  // private scheduledEffects = new Set();
  private scheduledEffectPhaseObservers = new Set<ObserverDefinition>();
  private scheduledObserverPhaseObservers = new Set<ObserverDefinition>();

  run(): void {
    for (;;) {
      switch (this.phase) {
        case "transaction":
          this.phase = "render";
          break;
        case "render":
          this.render();
          break;
        case "effect":
          this.effect();
          break;
        case "observer":
          this.observer();
          break;
        case null:
          return;
        default:
          throw new Error("Unimplemented");
      }
    }
  }

  /**
   *
   */
  private render(): void {
    const patches = new Map<Node, any>(this.scheduled);
    this.scheduled.clear();
    const discovered = new Set<TransformNode>();
    const queue = new Queue<TransformNode>();

    const nodeChanged = (node: Node) => {
      const expando = nodes.get(node)!;
      for (const consumer of expando.consumedBy) {
        if (!discovered.has(consumer)) {
          discovered.add(consumer);
          queue.push(nodes.get(consumer)!.id, consumer);
        }
      }
      for (const observer of expando.observedBy) {
        (observer.phase === "effect"
          ? this.scheduledEffectPhaseObservers
          : this.scheduledObserverPhaseObservers
        ).add(observer);
      }
    };

    for (const node of patches.keys()) {
      nodeChanged(node);
    }

    for (;;) {
      const current = queue.peekValue();
      if (!current) break;
      queue.pop();

      const inputs: { [K: string]: any } = {};
      for (const [name, node] of Object.entries<Node>(current._dependencies)) {
        if (patches.has(node)) {
          inputs[name] = patches.get(node);
        }
      }
      const hookContext = new HookContext<any>(
        nodes.get(current)!.hookContext ?? null
      );
      const patch = current._render(inputs, hookContext);
      if (patch !== null) {
        patches.set(current, patch);
        nodeChanged(current);
      }
    }

    for (const [node, patch] of patches) {
      node._commit(patch);
    }

    this.phase = "effect";
  }

  private effect(): void {
    for (const observer of this.scheduledEffectPhaseObservers) {
      observer.callback();
    }
    this.scheduledEffectPhaseObservers.clear();
    this.phase = this.scheduled.size !== 0 ? "render" : "observer";
  }

  private observer(): void {
    for (const observer of this.scheduledObserverPhaseObservers) {
      observer.callback();
    }
    this.scheduledObserverPhaseObservers.clear();
    this.phase = this.scheduled.size !== 0 ? "render" : null;
  }
}

/**
 *
 */
export function transaction<R>(callback: () => R): R {
  if (process.current !== null) {
    switch (process.current?.phase) {
      case "transaction":
        throw new Error("Transactions can't be nested.");
      case "render":
        throw new Error(
          "Renders must not have side-effects, including `setState()` or " +
            "`transaction()` calls. Execute side effects in a `useEffect()` " +
            "callback instead."
        );
      case "effect":
      case "observer":
        throw new Error(
          "Mutations performed by effects and observers are batched already, " +
            "you don't need to call `transaction()`."
        );
      default:
        throw new Error("Unimplemented");
    }
  }
  process.current = new Process("transaction");
  const result = callback();
  process.current.run();
  process.current = null;
  return result;
}
