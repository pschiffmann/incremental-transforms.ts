import { HookRenderer, TransformNode } from "./nodes";
import { mutateTransformNode } from "./process";

export type HookProps =
  | EffectHookProps
  | MemoHookProps
  | RefHookProps
  | StateHookProps;

export interface EffectHookProps {
  readonly type: "effect";

  /**
   * The cleanup function returned by this effect. It is filled in during the
   * `effect` phase.
   */
  cleanup: (() => void) | null;

  readonly deps: any[] | undefined;
}

export interface MemoHookProps {
  readonly type: "memo";
  readonly result: any;
  readonly deps: any[];
}

export interface RefHookProps {
  readonly type: "ref";
  readonly ref: RefObject<any>;
}

export interface StateHookProps {
  readonly type: "state";
  readonly setState: SetStateCallback<any>;
}

export interface RefObject<T> {
  current: T;
}

export type SetStateCallback<T> = (value: T | ((prev: T) => T)) => void;

export type HookPropsMap = Map<any, HookProps[]>;
export type HookStateMap = Map<any, Map<number, any>>;
export type HookPropsPatch = Map<any, HookProps[] | null>;
export type HookStatePatch = Map<any, Map<number, any>>;

let hookContext: HookContext | null = null;

/**
 * Returns a (hookRenderer, nextHookProps, effectCleanups, effects) tuple.
 * Modifies `newHookState` in-place.
 */
export function createHookRenderer(
  node: TransformNode,
  oldHookProps: HookPropsMap,
  oldHookState: HookStateMap,
  newHookState: HookStatePatch | null
): {
  hookRenderer: HookRenderer;
  newHookProps: HookPropsPatch;
  effectCleanups: (() => void)[];
  effects: (() => void)[];
} {
  const newHookProps: HookPropsPatch = new Map();
  const effectCleanups: (() => void)[] = [];
  const effects: (() => void)[] = [];

  const hookRenderer: HookRenderer = (key, callback) => {
    if (newHookProps.has(key)) {
      throw new Error("This key has already been rendered.");
    }
    if (!callback) {
      newHookProps.set(key, null);
      return undefined as any;
    }

    if (oldHookProps.has(key)) {
      hookContext = new UpdateContext(oldHookProps.get(key)!, (stateIndex) =>
        newHookState?.has(stateIndex)
          ? newHookState.get(stateIndex)!
          : oldHookState.get(stateIndex)!
      );
    } else {
      hookContext = new MountContext(node, key);
    }
    try {
      const result = callback();
      newHookProps.set(key, hookContext.newHookProps);
      if (hookContext instanceof UpdateContext) {
        if (
          hookContext.newHookProps.length !== hookContext.oldHookProps.length
        ) {
          throw new Error("You have conditionally called the last hooks");
        }
        effectCleanups.push(...hookContext.effectCleanups);
      }
      effects.push(...hookContext.effects);
      return result;
    } finally {
      hookContext = null;
    }
  };

  return { hookRenderer, newHookProps, effectCleanups, effects };
}

/**
 *
 */
abstract class HookContext {
  readonly newHookProps: HookProps[] = [];
  readonly effects: (() => void)[] = [];

  #executing: "memo" | "state" | null = null;

  /**
   *
   */
  executeCallback<R>(hook: "memo" | "state", callback: () => R): R {
    this.#executing = hook;
    // We don't need a try/finally here because if an error is thrown, the whole
    // transaction is aborted anyways.
    const result = callback();
    this.#executing = null;
    return result;
  }

  useEffect(callback: () => void | (() => void), deps?: any[]): void {
    const props: EffectHookProps = { type: "effect", cleanup: null, deps };
    this.newHookProps.push(props);
    this.effects.push(() => {
      props.cleanup = callback() || null;
    });
  }

  useMemo<R>(callback: () => R, deps: any[]): R {
    const result = this.executeCallback("memo", callback);
    this.newHookProps.push({ type: "memo", result, deps });
    return result;
  }

  abstract useRef<T>(initialValue: T): RefObject<T>;
  abstract useState<T>(initializer: T | (() => T)): [T, SetStateCallback<T>];

  /**
   *
   */
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

/**
 *
 */
class MountContext extends HookContext {
  constructor(node: TransformNode, key: any) {
    super();
    this.node = node;
    this.key = key;
  }

  readonly node: TransformNode;
  readonly key: any;
  readonly newHookState = new Map<number, any>();

  useRef<T>(initialValue: T): RefObject<T> {
    const ref: RefObject<T> = { current: initialValue };
    this.newHookProps.push({ type: "ref", ref });
    return ref;
  }

  useState<T>(initializer: T | (() => T)): [T, SetStateCallback<T>] {
    const { node, key } = this;
    const hookIndex = this.newHookProps.length;
    const state =
      initializer instanceof Function
        ? this.executeCallback("state", initializer)
        : initializer;
    const setState: SetStateCallback<T> = (value) =>
      mutateTransformNode(node, key, hookIndex, setState, value);

    this.newHookProps.push({ type: "state", setState });
    this.newHookState.set(hookIndex, state);
    return [state, setState];
  }
}

/**
 *
 */
class UpdateContext extends HookContext {
  constructor(
    oldHookProps: HookProps[],
    getHookState: (stateIndex: number) => any
  ) {
    super();
    this.oldHookProps = oldHookProps;
    this.getHookState = getHookState;
  }

  readonly oldHookProps: HookProps[];
  readonly effectCleanups: (() => void)[] = [];

  /**
   * Returns the value of the nth `useState()` hook.
   */
  readonly getHookState: (stateIndex: number) => any;

  getOldHookProps(type: "memo"): MemoHookProps;
  getOldHookProps(type: "effect"): EffectHookProps;
  getOldHookProps(type: "ref"): RefHookProps;
  getOldHookProps(type: "state"): StateHookProps;
  getOldHookProps(type: HookProps["type"]): HookProps {
    const result = this.oldHookProps[this.newHookProps.length];
    if (result?.type !== type) {
      throw new Error("Hooks must always be called in the same order.");
    }
    return result;
  }

  useEffect(callback: () => void | (() => void), deps?: any[]): void {
    const props = this.getOldHookProps("effect");
    if (depsEqual(props.deps, deps)) {
      this.newHookProps.push(props);
    } else {
      if (props.cleanup) this.effectCleanups.push(props.cleanup);
      super.useEffect(callback, deps);
    }
  }

  useMemo<R>(callback: () => R, deps: any[]): R {
    const props = this.getOldHookProps("memo");
    if (depsEqual(props.deps, deps)) {
      this.newHookProps.push(props);
      return props.result;
    } else {
      return super.useMemo(callback, deps);
    }
  }

  useRef<T>(): RefObject<T> {
    const props = this.getOldHookProps("ref");
    this.newHookProps.push(props);
    return props.ref;
  }

  useState<T>(): [T, SetStateCallback<T>] {
    const hookIndex = this.newHookProps.length;
    const state = this.getHookState(hookIndex);
    const props = this.getOldHookProps("state");
    this.newHookProps.push(props);
    return [state, props.setState];
  }
}

/**
 *
 */
export function useEffect(
  callback: () => void | (() => void),
  deps?: any[]
): void {
  return HookContext.current.useEffect(callback, deps);
}

/**
 *
 */
export function useMemo<R>(callback: () => R, deps: any[]): R {
  return HookContext.current.useMemo(callback, deps);
}

/**
 *
 */
export function useRef<T>(initialValue: T): RefObject<T> {
  return HookContext.current.useRef(initialValue);
}

/**
 *
 */
export function useState<T>(
  initializer: T | (() => T)
): [T, SetStateCallback<T>] {
  return HookContext.current.useState(initializer);
}

/**
 *
 */
function depsEqual(a?: any[], b?: any[]): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const l = a.length;
  if (l !== b.length) return false;
  for (let i = 0; i < l; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
