import { TransformNode } from "../nodes";
import type { EffectHookProps } from "./use-effect";
import type { MemoHookProps } from "./use-memo";
import type { StateHookProps } from "./use-state";

export type HookProps = EffectHookProps | MemoHookProps | StateHookProps;
export type HookType = HookProps["type"];

export class HookContext {
  constructor(
    node: TransformNode,
    lastHookProps: HookProps[] | null,
    nextHookProps: HookProps[],
    hookState: any[],
    effectCleanups: (() => void)[],
    effects: (() => void)[]
  ) {
    this.node = node;
    this.#lastHookProps = lastHookProps;
    this.#nextHookProps = nextHookProps;
    (this.#stateValues = hookState), (this.#effectCleanups = effectCleanups);
    this.#effects = effects;
  }

  readonly node: TransformNode;
  readonly key: any;

  #lastHookProps: HookProps[] | null;
  #nextHookProps: HookProps[];

  getLastHookProps(type: "memo"): MemoHookProps | null;
  getLastHookProps(type: "effect"): EffectHookProps | null;
  getLastHookProps(type: "state"): StateHookProps | null;
  getLastHookProps(type: HookType): HookProps | null {
    if (!this.#lastHookProps) return null;
    const result = this.#lastHookProps[this.#nextHookProps.length];
    if (result?.type !== type) {
      throw new Error("Hooks must always be called in the same order.");
    }
    return result;
  }

  pushHookProps(state: HookProps): void {
    this.#nextHookProps.push(state);
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

  #stateValues: any[];

  getState(index: number): any {
    return this.#stateValues[index];
  }

  pushState(value: any): number {
    this.#stateValues.push(value);
    return this.#stateValues.length - 1;
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
  nextHookProps: HookPropsMap,
  nextHookState: HookStateMap,
  effectCleanups: (() => void)[],
  effects: (() => void)[],
  key: K,
  callback: () => R
): R {
  const nextProps: HookProps[] = [];
  nextHookProps.set(key, nextProps);
  const nextState: any[] = [];
  nextHookState.set(key, nextState);
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
