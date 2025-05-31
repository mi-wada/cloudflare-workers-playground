import { describe, expect, it } from "vitest";
import {
	randomCode,
	isValidUrl,
	shortCodeToOriginalURL,
	toShortUrl,
} from "./domain";

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
		expect(a).not.toBe(b);
	});
});

describe("isValidUrl", () => {
	it("returns true for valid URLs", () => {
		expect(isValidUrl("https://example.com")).toBe(true);
		expect(isValidUrl("http://localhost:8080/path")).toBe(true);
	});
	it("returns false for invalid URLs", () => {
		expect(isValidUrl("")).toBe(false);
		expect(isValidUrl("not a url")).toBe(false);
	});
});
