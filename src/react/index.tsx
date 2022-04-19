import { useSyncExternalStore } from "react";
import { transaction } from "../core/index.js";
import { IncrementalMap } from "../map/index.js";
import { IncrementalValue } from "../value/index.js";

function subscribe(onStoreChange: () => void): () => void {
  transaction.on("commit", onStoreChange);
  return function unsubscribe() {
    transaction.off("commit", onStoreChange);
  };
}

export function useIncrementalValue<T>(value: IncrementalValue<T>): T {
  return useSyncExternalStore(subscribe, () => value.current);
}

export function useIncrementalMapGet<K, V>(
  map: IncrementalMap<K, V>,
  key: K
): V | undefined {
  return useSyncExternalStore(subscribe, () => map.get(key));
}
