import { describe, it, expect } from "vitest";
import { greeting } from "./index";

describe("greeting", () => {
  it("returns 'Hello, Anonymous!' when no name is provided", () => {
    expect(greeting()).toBe("Hello, Anonymous!");
  });

  it("returns 'Hello, {name}!' when a name is provided", () => {
    expect(greeting("Taro")).toBe("Hello, Taro!");
    expect(greeting("Alice")).toBe("Hello, Alice!");
  });
});
