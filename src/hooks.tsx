import { process } from "./globals";
import { Process } from "./process";

interface HookContextInternal {
  currentState: HookState[];
  previousState: HookState[] | null;
  scheduledEffectCleanups: (() => void)[];
  scheduledEffects: ScheduledEffect[];
  executing: "memo" | "state" | null;
}

interface ScheduledEffect {
  readonly callback: EffectCallback;
  readonly state: EffectHookState;
}

let hookContext: HookContextInternal | null = null;

export class HookContext<K> {
  constructor(previous: HookContext<K> | null) {
    this.previous = previous;
  }

  previous: HookContext<K> | null;
  readonly state = new Map<K, HookState[]>();
  readonly scheduledEffectCleanups: (() => void)[] = [];
  readonly scheduledEffects: ScheduledEffect[] = [];

  render<R>(callback: () => R, key?: K): R {
    if (this.state.has(key!)) {
      throw new Error("This key was already rendered during this phase.");
    }
    const currentState = this.state.get(key!)!;
    const previousState = this.previous?.state.get(key!) ?? null;
    hookContext = {
      currentState,
      previousState,
      scheduledEffectCleanups: this.scheduledEffectCleanups,
      scheduledEffects: this.scheduledEffects,
      executing: null
    };
    const result = callback();
    this.state.set(key!, currentState);
    hookContext = null;
    return result;
  }

  unmount(key: K): void {}

  close(): (() => void)[] {
    return [];
  }
}

function getLastHookState(type: "memo"): MemoHookState | null;
function getLastHookState(type: "effect"): EffectHookState | null;
function getLastHookState(type: "state"): StateHookState | null;
function getLastHookState(type: string): HookState | null {
  const { currentState, previousState } = hookContext!;
  if (!previousState) return null;
  const result = previousState[currentState.length];
  if (result.type !== type) {
    throw new Error();
  }
  return result;
}

function assertHooksAreCallable(): void {
  if (process.current?.phase !== "render") {
    throw new Error("Hooks may only be called by render functions.");
  }
  if (!hookContext) {
    throw new Error(
      "TransformNodes must pass their callback functions to `HookContext`, " +
        "or hooks won't work."
    );
  }
  switch (hookContext.executing) {
    case "memo":
      throw new Error("Invalid hook call inside `useMemo()` body.");
    case "state":
      throw new Error("Invalid hook call inside `useState()` initializer.");
  }
}

type HookState = MemoHookState | EffectHookState | StateHookState;

interface MemoHookState {
  readonly type: "memo";
  readonly result: any;
  readonly deps: any[];
}

export function useMemo<R>(callback: () => R, deps: any[]): R {
  assertHooksAreCallable();
  const lastState = getLastHookState("memo");
  let result: R;
  if (lastState && depsEqual(deps, lastState.deps)) {
    result = lastState.result;
    hookContext!.currentState.push(lastState);
  } else {
    hookContext!.executing = "memo";
    result = callback();
    hookContext!.executing = null;
    hookContext!.currentState.push({ type: "memo", result, deps: [...deps] });
  }
  return result;
}

interface EffectHookState {
  type: "effect";

  /**
   * The cleanup function returned by this effect. It is filled in during the
   * effect phase.
   */
  cleanup: (() => void) | null;
  deps: any[] | undefined;
}

export type EffectCallback = () => void | (() => void);

export function useEffect(callback: EffectCallback, deps?: any[]): void {
  assertHooksAreCallable();
  const lastState = getLastHookState("effect");
  if (!lastState || !depsEqual(deps, lastState.deps)) {
    const nextState: EffectHookState = {
      type: "effect",
      cleanup: null,
      deps: deps && [...deps]
    };
    hookContext!.scheduledEffects.push({ callback, state: nextState });
    if (lastState?.cleanup) {
      hookContext!.scheduledEffectCleanups.push(lastState.cleanup);
    }
    hookContext!.currentState.push(nextState);
  } else {
    hookContext!.currentState.push(lastState);
  }
}

interface StateHookState {
  type: "state";
  value: any;
  setState: SetStateCallback<any>;
}

export type SetStateCallback<T> =
  | ((value: T) => void)
  | ((callback: (value: T) => T) => void);

export function useState<T>(
  initializer: T | (() => T)
): [T, SetStateCallback<T>] {
  assertHooksAreCallable();
  const lastState = getLastHookState("state");
  if (lastState) {
    hookContext!.currentState.push(lastState);
    return [lastState.value, lastState.setState];
  }

  let value: T;
  if (initializer instanceof Function) {
    hookContext!.executing = "state";
    value = initializer();
    hookContext!.executing = null;
  } else {
    value = initializer;
  }

  const nextState: StateHookState = {
    type: "state",
    value,
    setState(x: T | ((current: T) => T)) {
      if (process.current?.phase === "render") {
        throw new Error();
      }
      const newValue = x instanceof Function ? x(nextState.value) : x;
      if (!Object.is(nextState.value, newValue)) {
        nextState.value = newValue;
        // TODO: Schedule render
      }
    }
  };
  hookContext!.currentState.push(nextState as StateHookState);
  return [nextState.value, nextState.setState];
}

function depsEqual(a?: any[], b?: any[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const l = a.length;
  if (l !== b.length) return false;
  for (let i = 0; i < l; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
