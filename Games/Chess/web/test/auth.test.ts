import { describe, expect, it } from "vitest";
import {
  authErrorDetail,
  authErrorMessage,
  emailAuthTransportSafe,
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from "../src/lib/auth";

describe("account validation", () => {
  it("normalizes and validates email addresses", () => {
    expect(normalizeEmail("  Player@Example.COM ")).toBe("player@example.com");
    expect(validateEmail("player@example.com")).toBeNull();
    expect(validateEmail("player@example")).toMatch(/valid email/i);
    expect(validateEmail("")).toMatch(/enter your email/i);
  });

  it("requires a reasonable password", () => {
    expect(validatePassword("chess123")).toBeNull();
    expect(validatePassword("short1")).toMatch(/8 characters/i);
    expect(validatePassword("onlyletters")).toMatch(/letter and one number/i);
  });

  it("treats player names as optional but validates entered names", () => {
    expect(validateUsername("")).toBeNull();
    expect(validateUsername("Moon_Player")).toBeNull();
    expect(validateUsername("no spaces")).toMatch(/3–20/i);
  });
});

describe("account transport and errors", () => {
  it("allows TLS and local development without allowing public HTTP auth", () => {
    expect(emailAuthTransportSafe("games.example.com", true)).toBe(true);
    expect(emailAuthTransportSafe("127.0.0.1", false)).toBe(true);
    expect(emailAuthTransportSafe("192.168.1.20", false)).toBe(true);
    expect(emailAuthTransportSafe("games.example.com", false)).toBe(false);
  });

  it("turns server failures into actionable messages", () => {
    expect(
      authErrorMessage(new Error("User account not found."), "sign-in"),
    ).toMatch(/email or password/i);
    expect(
      authErrorMessage(new Error("Email address already in use."), "sign-up"),
    ).toMatch(/already registered/i);
    expect(
      authErrorMessage(new Error("Username is already taken."), "sign-up"),
    ).toMatch(/player name is already taken/i);
    expect(authErrorMessage(new Error("Failed to fetch"), "sign-in")).toMatch(
      /could not reach/i,
    );
  });

  it("reads Nakama response bodies before mapping login failures", async () => {
    const duplicate = new Response(
      JSON.stringify({ message: "Email address already in use." }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(
      authErrorMessage(await authErrorDetail(duplicate), "sign-up"),
    ).toMatch(/already registered/i);

    const unauthorized = new Response("", { status: 401 });
    expect(
      authErrorMessage(await authErrorDetail(unauthorized), "sign-in"),
    ).toMatch(/email or password/i);
  });
});
