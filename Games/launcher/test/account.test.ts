import { describe, expect, it } from "vitest";
import {
  emailAuthTransportSafe,
  normalizeEmail,
  parseLauncherServerAddress,
  validateEmail,
  validatePassword,
  validateUsername,
} from "../src/lib/account";

describe("launcher account helpers", () => {
  it("validates email, password, and player names", () => {
    expect(normalizeEmail("  Player@Example.COM ")).toBe("player@example.com");
    expect(validateEmail("")).toBe("Enter your email address.");
    expect(validateEmail("player@example.com")).toBeNull();
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
    expect(validatePassword("short")).toBe("Use at least 8 characters.");
    expect(validatePassword("lettersonly")).toBe(
      "Include at least one letter and one number.",
    );
    expect(validatePassword("moongames1")).toBeNull();
    expect(validateUsername("")).toBeNull();
    expect(validateUsername("Moon Player")).toBe(
      "Use 3–20 letters, numbers, or underscores.",
    );
    expect(validateUsername("moon_player")).toBeNull();
  });

  it("parses server addresses and labels the active endpoint", () => {
    expect(parseLauncherServerAddress("http://127.0.0.1:7350")).toEqual({
      host: "127.0.0.1",
      port: "7350",
      useSSL: false,
      label: "http://127.0.0.1:7350",
    });
    expect(parseLauncherServerAddress("https://games.example.com")).toEqual({
      host: "games.example.com",
      port: "443",
      useSSL: true,
      label: "https://games.example.com:443",
    });
  });

  it("only sends credentials over TLS or private-network HTTP", () => {
    expect(emailAuthTransportSafe("games.example.com", true)).toBe(true);
    expect(emailAuthTransportSafe("127.0.0.1", false)).toBe(true);
    expect(emailAuthTransportSafe("localhost", false)).toBe(true);
    expect(emailAuthTransportSafe("192.168.0.100", false)).toBe(true);
    expect(emailAuthTransportSafe("172.20.1.4", false)).toBe(true);
    expect(emailAuthTransportSafe("games.example.com", false)).toBe(false);
    expect(emailAuthTransportSafe("8.8.8.8", false)).toBe(false);
  });
});
