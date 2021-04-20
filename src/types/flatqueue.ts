declare module "flatqueue" {
  export default class FlatQueue<T> {
    clear(): void;
    push(id: number, value: T): void;
    pop(): number | undefined;
    peek(): number | undefined;
    peekValue(): T | undefined;
  }
}
