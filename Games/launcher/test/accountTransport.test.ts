import { describe, expect, it } from "vitest";
import {
  accountCreationAllowed,
  insecureConnectionRequested,
} from "@moongames/game-sdk";

/**
 * A host that tests through a plain tunnel knows the connection is plain and
 * says so. Nothing else allows an account over one.
 */
describe("a plain connection", () => {
  it("is refused by default", () => {
    expect(
      accountCreationAllowed({ host: "bore.pub", useSSL: false }),
    ).toBe(false);
  });

  it("is allowed when the host says so", () => {
    expect(
      accountCreationAllowed({
        host: "bore.pub",
        useSSL: false,
        allowInsecure: true,
      }),
    ).toBe(true);
  });

  it("is always allowed when the connection is secure", () => {
    expect(
      accountCreationAllowed({ host: "bore.pub", useSSL: true }),
    ).toBe(true);
  });

  it("is asked for in the address", () => {
    expect(insecureConnectionRequested("?insecure=1")).toBe(true);
    expect(insecureConnectionRequested("?insecure=true")).toBe(true);
    expect(insecureConnectionRequested("?allowInsecure=1")).toBe(true);
    expect(insecureConnectionRequested("")).toBe(false);
    expect(insecureConnectionRequested("?other=1")).toBe(false);
  });
});
