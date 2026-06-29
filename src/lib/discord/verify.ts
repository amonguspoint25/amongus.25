import crypto from "crypto";

// Discord signs every interaction request with Ed25519 over (timestamp + rawBody). We verify it
// with Node's built-in crypto (no extra dependency). The app's hex public key is wrapped in the
// fixed Ed25519 SPKI DER prefix so createPublicKey can ingest the raw 32-byte key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex: string | undefined,
): boolean {
  if (!signatureHex || !timestamp || !publicKeyHex) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}
