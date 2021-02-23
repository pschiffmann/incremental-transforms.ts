import { HookContext } from "./context";

export interface EffectHookProps {
  type: "effect";

  /**
   * The cleanup function returned by this effect. It is filled in during the
   * effect phase.
   */
  cleanup: (() => void) | null;

  deps: any[] | undefined;
}

/**
 * `deps` may be present in one render and absent in the next one, or may vary
 * in length between renders. However, note that `deps` is not copied to a new
 * array – if you have other references to `deps` and modify this array
 * in-place, those changes will be visible to the diff algorithm.
 */
export function useEffect(
  callback: () => void | (() => void),
  deps?: any[]
): void {
  const context = HookContext.current;
  const lastState = context.getLastHookProps("effect");
  if (!lastState || !depsEqual(deps, lastState.deps)) {
    const nextState: EffectHookProps = { type: "effect", cleanup: null, deps };
    context.enqueueEffect(lastState && lastState.cleanup, () => {
      nextState.cleanup = callback() || null;
    });
    context.pushHookProps(nextState);
  } else {
    context.pushHookProps(lastState);
  }
}
