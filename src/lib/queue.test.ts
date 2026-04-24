import { describe, it, expect } from "vitest";
import { resolveConcurrencyCap } from "./queue";

describe("resolveConcurrencyCap", () => {
  it("returns spec-mandated caps for the six department roles", () => {
    expect(resolveConcurrencyCap("main")).toBe(10);
    expect(resolveConcurrencyCap("research")).toBe(8);
    expect(resolveConcurrencyCap("comms")).toBe(6);
    expect(resolveConcurrencyCap("content")).toBe(4);
    expect(resolveConcurrencyCap("ops")).toBe(6);
    expect(resolveConcurrencyCap("legal")).toBe(3);
  });

  it("defaults ephemeral / unknown roles to 2", () => {
    expect(resolveConcurrencyCap("tax-researcher")).toBe(2);
    expect(resolveConcurrencyCap("")).toBe(2);
    expect(resolveConcurrencyCap("whatever")).toBe(2);
  });
});
