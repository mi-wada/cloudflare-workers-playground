import { describe, expect, it } from "vitest";
import { randomCode } from "./index";

describe("randomCode", () => {
	it("should return a string of specified length", () => {
		expect(randomCode(6)).toHaveLength(6);
		expect(randomCode(10)).toHaveLength(10);
	});

	it("should only contain alphanumeric characters", () => {
		const code = randomCode(32);
		expect(code).toMatch(/^[a-zA-Z0-9]+$/);
	});

	it("should return different values on multiple calls (likely)", () => {
		const a = randomCode(8);
		const b = randomCode(8);
		// Not strictly guaranteed, but highly likely
		expect(a).not.toBe(b);
	});
});
