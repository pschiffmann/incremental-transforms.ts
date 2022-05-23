import { Context, map } from "../value/index.js";
import { IncrementalMap } from "./base.js";
import { filter } from "./filter.js";
import { size } from "./size.js";

export function some<K, V, C extends Context>(
  self: IncrementalMap<K, V>,
  predicate: (key: K, value: V) => boolean,
  context?: C
) {
  const filtered = filter(self, predicate, context);
  const count = size(filtered);
  const hasItems = map(count, (n) => n !== 0);
  return hasItems;
}
