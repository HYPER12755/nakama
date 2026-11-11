import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bundleSigningPayload,
  type GameBundleDescriptor,
  type ReleaseManifest,
} from "@moongames/game-sdk";
import {
  base64ToBytes,
  bytesToHex,
  selectBundleForHost,
  verifyBundleBytes,
  verifyBundleSignature,
} from "../src";

function rawPublicKey(publicKey: ReturnType<typeof createPublicKey>): string {
  const jwk = publicKey.export({ format: "jwk" });
  return Buffer.from(jwk.x ?? "", "base64url").toString("base64");
}

function makeSignedDescriptor(data: Uint8Array) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = rawPublicKey(publicKey);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const unsigned: Omit<GameBundleDescriptor, "signature"> = {
    format: 1,
    gameId: "chess",
    gameName: "Chess",
    version: "0.2.0",
    sdkVersion: "0.1.0",
    minHostProtocol: 1,
    entry: "index.html",
    capabilities: ["local"],
    publishedAt: "2026-01-02T03:04:05.000Z",
    sha256,
    size: data.byteLength,
    url: "chess/0.2.0/chess-0.2.0.zip",
    keyId: "test-1",
    publicKey: publicKeyBase64,
  };
  const payload = bundleSigningPayload({
    ...unsigned,
    signature: Buffer.alloc(64).toString("base64"),
  });
  const signature = sign(null, Buffer.from(payload), privateKey).toString(
    "base64",
  );
  return { descriptor: { ...unsigned, signature }, payload };
}

describe("host bundle verification", () => {
  it("verifies signatures and bytes with the default noble adapter", async () => {
    const data = Buffer.from("<html>MoonGames</html>");
    const { descriptor, payload } = makeSignedDescriptor(data);
    expect(payload).toBe(bundleSigningPayload(descriptor));
    expect(base64ToBytes(descriptor.publicKey)).toHaveLength(32);
    expect(bytesToHex(createHash("sha256").update(data).digest())).toBe(
      descriptor.sha256,
    );

    await expect(
      verifyBundleSignature(descriptor, { "test-1": descriptor.publicKey }),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyBundleBytes(descriptor, data, { "test-1": descriptor.publicKey }),
    ).resolves.toEqual({ ok: true });
    await expect(verifyBundleBytes(descriptor, data)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects tampered bytes, signatures, and untrusted keys", async () => {
    const data = Buffer.from("<html>MoonGames</html>");
    const { descriptor } = makeSignedDescriptor(data);
    const tampered = new Uint8Array(data);
    tampered[0] ^= 1;

    const bytesResult = await verifyBundleBytes(
      descriptor,
      tampered,
      { "test-1": descriptor.publicKey },
    );
    expect(bytesResult.ok).toBe(false);
    expect(bytesResult.error).toContain("SHA-256");

    const signatureResult = await verifyBundleSignature(
      { ...descriptor, entry: "other.html" },
      { "test-1": descriptor.publicKey },
    );
    expect(signatureResult.ok).toBe(false);
    expect(signatureResult.error).toContain("signature");

    const wrongKey = rawPublicKey(generateKeyPairSync("ed25519").publicKey);
    const wrongResult = await verifyBundleSignature(descriptor, {
      "test-1": wrongKey,
    });
    expect(wrongResult.ok).toBe(false);
  });

  it("selects compatible bundles and enforces pinned keys", () => {
    const data = Buffer.from("bundle");
    const { descriptor } = makeSignedDescriptor(data);
    const manifest: ReleaseManifest = {
      format: 1,
      generatedAt: "2026-01-02T03:04:05.000Z",
      signers: {
        "test-1": { algorithm: "ed25519", publicKey: descriptor.publicKey },
      },
      bundles: [
        descriptor,
        {
          ...descriptor,
          version: "0.3.0",
          minHostProtocol: 2,
        },
      ],
    };

    expect(
      selectBundleForHost(manifest, "chess", 1, {
        "test-1": descriptor.publicKey,
      }).descriptor.version,
    ).toBe("0.2.0");
    expect(
      selectBundleForHost(manifest, "chess", 2, {
        "test-1": descriptor.publicKey,
      }).descriptor.version,
    ).toBe("0.3.0");
    expect(() => selectBundleForHost(manifest, "chess", 1, {})).toThrow(
      "trusted public key",
    );
    expect(() =>
      selectBundleForHost(manifest, "checkers", 1, {
        "test-1": descriptor.publicKey,
      }),
    ).toThrow("No compatible");
  });
});
