import { mutateTransformNode } from "./process";
let hookContext = null;
/**
 * Returns a (hookRenderer, nextHookProps, effectCleanups, effects) tuple.
 * Modifies `newHookState` in-place.
 */
export function createHookRenderer(
  node,
  oldHookProps,
  oldHookState,
  newHookState
) {
  const newHookProps = new Map();
  const effectCleanups = [];
  const effects = [];
  const hookRenderer = (key, callback) => {
    if (newHookProps.has(key)) {
      throw new Error("This key has already been rendered.");
    }
    if (!callback) {
      newHookProps.set(key, null);
      return undefined;
    }
    if (oldHookProps.has(key)) {
      hookContext = new UpdateContext(oldHookProps.get(key), (stateIndex) =>
        newHookState?.has(stateIndex)
          ? newHookState.get(stateIndex)
          : oldHookState.get(stateIndex)
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
class HookContext {
  constructor() {
    this.newHookProps = [];
    this.effects = [];
    this.#executing = null;
  }
  #executing;
  /**
   *
   */
  executeCallback(hook, callback) {
    this.#executing = hook;
    // We don't need a try/finally here because if an error is thrown, the whole
    // transaction is aborted anyways.
    const result = callback();
    this.#executing = null;
    return result;
  }
  useEffect(callback, deps) {
    const props = { type: "effect", cleanup: null, deps };
    this.newHookProps.push(props);
    this.effects.push(() => {
      props.cleanup = callback() || null;
    });
  }
  useMemo(callback, deps) {
    const result = this.executeCallback("memo", callback);
    this.newHookProps.push({ type: "memo", result, deps });
    return result;
  }
  /**
   *
   */
  static get current() {
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
  constructor(node, key) {
    super();
    this.newHookState = new Map();
    this.node = node;
    this.key = key;
  }
  useRef(initialValue) {
    const ref = { current: initialValue };
    this.newHookProps.push({ type: "ref", ref });
    return ref;
  }
  useState(initializer) {
    const { node, key } = this;
    const hookIndex = this.newHookProps.length;
    const state =
      initializer instanceof Function
        ? this.executeCallback("state", initializer)
        : initializer;
    const setState = (value) =>
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
  constructor(oldHookProps, getHookState) {
    super();
    this.effectCleanups = [];
    this.oldHookProps = oldHookProps;
    this.getHookState = getHookState;
  }
  getOldHookProps(type) {
    const result = this.oldHookProps[this.newHookProps.length];
    if (result?.type !== type) {
      throw new Error("Hooks must always be called in the same order.");
    }
    return result;
  }
  useEffect(callback, deps) {
    const props = this.getOldHookProps("effect");
    if (depsEqual(props.deps, deps)) {
      this.newHookProps.push(props);
    } else {
      if (props.cleanup) this.effectCleanups.push(props.cleanup);
      super.useEffect(callback, deps);
    }
  }
  useMemo(callback, deps) {
    const props = this.getOldHookProps("memo");
    if (depsEqual(props.deps, deps)) {
      this.newHookProps.push(props);
      return props.result;
    } else {
      return super.useMemo(callback, deps);
    }
  }
  useRef() {
    const props = this.getOldHookProps("ref");
    this.newHookProps.push(props);
    return props.ref;
  }
  useState() {
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
export function useEffect(callback, deps) {
  return HookContext.current.useEffect(callback, deps);
}
/**
 *
 */
export function useMemo(callback, deps) {
  return HookContext.current.useMemo(callback, deps);
}
/**
 *
 */
export function useRef(initialValue) {
  return HookContext.current.useRef(initialValue);
}
/**
 *
 */
export function useState(initializer) {
  return HookContext.current.useState(initializer);
}
/**
 *
 */
function depsEqual(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const l = a.length;
  if (l !== b.length) return false;
  for (let i = 0; i < l; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
