import { HookContext } from "./context";

export interface RefHookProps {
  readonly type: "ref";
  readonly ref: RefObject<any>;
}

export interface RefObject<T> {
  current: T;
}

export function useRef<T>(initialValue: T): RefObject<T> {
  const context = HookContext.current;
  const props: RefHookProps = context.getLastHookProps("ref") ?? {
    type: "ref",
    ref: { current: initialValue },
  };
  context.pushHookProps(props);
  return props.ref;
}
