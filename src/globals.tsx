import type { Process } from "./process";
import type { Node, NodeExpando } from "./nodes";

export const nodes = new Map<Node, NodeExpando>();

export const process: { current: Process | null } = { current: null };
