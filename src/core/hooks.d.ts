import { HookRenderer, TransformNode } from "./nodes";
export declare type HookProps =
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
export declare type SetStateCallback<T> = (value: T | ((prev: T) => T)) => void;
export declare type HookPropsMap = Map<any, HookProps[]>;
export declare type HookStateMap = Map<any, Map<number, any>>;
export declare type HookPropsPatch = Map<any, HookProps[] | null>;
export declare type HookStatePatch = Map<any, Map<number, any>>;
/**
 * Returns a (hookRenderer, nextHookProps, effectCleanups, effects) tuple.
 * Modifies `newHookState` in-place.
 */
export declare function createHookRenderer(
  node: TransformNode,
  oldHookProps: HookPropsMap,
  oldHookState: HookStateMap,
  newHookState: HookStatePatch | null
): {
  hookRenderer: HookRenderer;
  newHookProps: HookPropsPatch;
  effectCleanups: (() => void)[];
  effects: (() => void)[];
};
/**
 *
 */
export declare function useEffect(
  callback: () => void | (() => void),
  deps?: any[]
): void;
/**
 *
 */
export declare function useMemo<R>(callback: () => R, deps: any[]): R;
/**
 *
 */
export declare function useRef<T>(initialValue: T): RefObject<T>;
/**
 *
 */
export declare function useState<T>(
  initializer: T | (() => T)
): [T, SetStateCallback<T>];
