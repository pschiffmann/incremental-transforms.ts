import { mutateTransformNode } from "../process";
import { HookContext } from "./context";

export interface StateHookProps {
  readonly type: "state";
  readonly stateIndex: number;
  readonly setState: SetStateCallback<any>;
}

export type SetStateCallback<T> =
  | ((value: T) => void)
  | ((callback: (value: T) => T) => void);

export function useState<T>(
  initializer: T | (() => T)
): [T, SetStateCallback<T>] {
  const context = HookContext.current;
  const lastProps = context.getLastHookProps("state");
  if (lastProps) {
    context.pushHookProps(lastProps);
    return [context.getState(lastProps.stateIndex), lastProps.setState];
  }

  const value =
    initializer instanceof Function
      ? context.executeCallback("state", initializer)
      : initializer;
  const stateIndex = context.pushState(value);
  const { node, key } = context;

  let hookIndex: number;
  function setState(value: any | ((current: any) => any)) {
    mutateTransformNode(node, key, hookIndex, setState, stateIndex, value);
  }
  hookIndex = context.pushHookProps({ type: "state", stateIndex, setState });
  return [value, setState];
}
