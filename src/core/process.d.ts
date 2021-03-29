import { SetStateCallback } from "./hooks";
import { SourceNode, TransformNode } from "./nodes";
export declare type ErrorHandler = (error: any) => void;
export declare function transaction<R>(
  callback: () => R,
  onError?: ErrorHandler
): R;
export declare namespace transaction {
  const inProgress: boolean;
}
/**
 *
 */
export declare function mutateSourceNode<P, T extends SourceNode<P>>(
  node: T,
  setStateCallback: (patch: P) => P | null
): void;
/**
 * `setStateCallback` is only used to verify that the call has not been made
 * through a stale reference.
 */
export declare function mutateTransformNode<T>(
  node: TransformNode,
  key: any,
  hookIndex: number,
  setStateCallback: SetStateCallback<T>,
  value: Parameters<SetStateCallback<T>>[0]
): void;
/**
 *
 */
export declare function connect(node: TransformNode): void;
/**
 *
 */
export declare function disconnect(node: TransformNode): void;
