export type BundleUpdateMode = "background" | "forced" | "prompt" | "manual";

export interface BundleUpdatePolicy {
  mode: BundleUpdateMode;
  checkIntervalMs?: number;
  keepVersions?: number;
}

export const DEFAULT_UPDATE_POLICY: BundleUpdatePolicy = {
  mode: "background",
  checkIntervalMs: 6 * 60 * 60 * 1000,
  keepVersions: 2,
};

export interface BundleDeltaFile {
  path: string;
  sha256: string;
  size: number;
  url: string;
}

export const BUNDLE_DELTA_FORMAT = 2;

export interface BundleDelta {
  format: typeof BUNDLE_DELTA_FORMAT;
  gameId: string;
  baseVersion: string;
  baseSha256: string;
  targetVersion: string;
  targetSha256: string;
  files: BundleDeltaFile[];
  removed: string[];
  keyId: string;
  publicKey: string;
  signature: string;
}

export function bundleDeltaSigningPayload(delta: BundleDelta): string {
  const files = delta.files
    .map((file) => `${file.path}\t${file.sha256}\t${file.size}`)
    .join("\n");
  return [
    "moongames-delta-v2",
    String(delta.format),
    delta.gameId,
    delta.baseVersion,
    delta.baseSha256,
    delta.targetVersion,
    delta.targetSha256,
    delta.keyId,
    files,
    delta.removed.join("\n"),
  ].join("\n");
}

export interface PartnerAuthProofInput {
  partnerId: string;
  email: string;
  timestamp: number;
  nonce: string;
}

export interface PartnerAuthRequest extends PartnerAuthProofInput {
  proof: string;
}

export interface PartnerAuthSession {
  token: string;
  refreshToken: string;
  userId: string;
  username: string;
  expiresAt: number;
}
