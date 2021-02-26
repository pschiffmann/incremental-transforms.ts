import { TransformNode } from "../nodes";
import type { EffectHookProps } from "./use-effect";
import type { MemoHookProps } from "./use-memo";
import type { RefHookProps } from "./use-ref";
import type { StateHookProps } from "./use-state";

export type HookProps =
  | EffectHookProps
  | MemoHookProps
  | RefHookProps
  | StateHookProps;

export type HookType = HookProps["type"];

export class HookContext {
  constructor(
    node: TransformNode,
    lastHookProps: HookProps[] | null,
    nextHookProps: HookProps[],
    lastHookState: any[],
    nextHookState: Map<number, any>,
    effectCleanups: (() => void)[],
    effects: (() => void)[]
  ) {
    this.node = node;
    this.#lastHookProps = lastHookProps;
    this.#nextHookProps = nextHookProps;
    this.#lastHookState = lastHookState;
    this.#nextHookState = nextHookState;
    this.#effectCleanups = effectCleanups;
    this.#effects = effects;
  }

  readonly node: TransformNode;
  readonly key: any;

  #lastHookProps: HookProps[] | null;
  #nextHookProps: HookProps[];

  getLastHookProps(type: "memo"): MemoHookProps | null;
  getLastHookProps(type: "effect"): EffectHookProps | null;
  getLastHookProps(type: "ref"): RefHookProps | null;
  getLastHookProps(type: "state"): StateHookProps | null;
  getLastHookProps(type: HookType): HookProps | null {
    if (!this.#lastHookProps) return null;
    const result = this.#lastHookProps[this.#nextHookProps.length];
    if (result?.type !== type) {
      throw new Error("Hooks must always be called in the same order.");
    }
    return result;
  }

  pushHookProps(state: HookProps): number {
    this.#nextHookProps.push(state);
    return this.#nextHookProps.length - 1;
  }

  #effectCleanups: (() => void)[];
  #effects: (() => void)[];

  enqueueEffect(
    previousCleanup: (() => void) | null,
    effect: () => void
  ): void {
    if (previousCleanup) this.#effectCleanups.push(previousCleanup);
    this.#effects.push(effect);
  }

  #executing: HookType | null = null;

  executeCallback<R>(hook: HookType, callback: () => R): R {
    this.#executing = hook;
    // We don't need a try/finally here because if an error is thrown, the whole
    // transaction is aborted anyways.
    const result = callback();
    this.#executing = null;
    return result;
  }

  #lastHookState: any[];
  #nextHookState: Map<number, any>;

  getState(stateIndex: number): any {
    return this.#nextHookState.has(stateIndex)
      ? this.#nextHookState.get(stateIndex)
      : this.#lastHookState[stateIndex];
  }

  /**
   *
   */
  pushState(value: any): number {
    const stateIndex = this.#nextHookState.size;
    this.#nextHookState.set(stateIndex, value);
    return stateIndex;
  }

  static get current(): HookContext {
    if (!hookContext) {
      throw new Error("Hooks may only be called by render functions.");
    }
    switch (hookContext.#executing) {
      case "memo":
        throw new Error("Invalid hook call inside `useMemo()` body.");
      case "state":
        throw new Error("Invalid hook call inside `useState()` initializer.");
    }
    return hookContext;
  }
}

let hookContext: HookContext | null = null;

/**
 * process.render() binds the first argument to the context for the current
 * node, before passing the callback to `node._render()`.
 */
export function executeWithHooks<K, R>(
  node: TransformNode,
  lastHookProps: HookPropsMap,
  nextHookProps: Map<TransformNode, any[] | null>,
  effectCleanups: (() => void)[],
  effects: (() => void)[],
  key: K,
  callback?: () => R
): R {
  if (nextHookProps.has(key)) {
    throw new Error("This key has already been rendered.");
  }
  if (!callback) {
    nextHookProps.set(key, null);
    return;
  }

  const nextProps: HookProps[] = [];
  nextHookProps.set(key, nextProps);
  hookContext = new HookContext(
    node,
    lastHookProps.get(key) ?? null,
    nextProps,
    nextState,
    effectCleanups,
    effects
  );
  try {
    return callback();
  } finally {
    hookContext = null;
  }
}

export type HookPropsMap = Map<any, HookProps[]>;
export type HookStateMap = Map<any, any[]>;
