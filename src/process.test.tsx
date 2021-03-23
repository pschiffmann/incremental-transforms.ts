import { transaction } from "./process";

test("adds 1 + 2 to equal 3", () => {
  expect(1 + 2).toBe(3);
  expect(transaction).not.toBeNull();
});
