import { HookContext } from "./context";

export interface MemoHookProps {
  readonly type: "memo";
  readonly result: any;
  readonly deps: any[];
}

export function useMemo<R>(callback: () => R, deps: any[]): R {
  const context = HookContext.current;
  const lastState = context.getLastHookProps("memo");
  let result: R;
  if (lastState && depsEqual(deps, lastState.deps)) {
    result = lastState.result;
    context.pushHookProps(lastState);
  } else {
    result = context.executeCallback("memo", callback);
    context.pushHookProps({ type: "memo", result, deps: [...deps] });
  }
  return result;
}
