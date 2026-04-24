import { type CopilotSettings } from "@/settings/model";
import { decryptMobile, encryptMobile } from "@/utils/mobileEncryption";
import { Buffer } from "buffer";
import { Platform } from "obsidian";

// @ts-ignore
let safeStorageInternal: Electron.SafeStorage | null = null;

function getSafeStorage() {
  if (Platform.isDesktop && safeStorageInternal) {
    return safeStorageInternal;
  }
  // Dynamically import electron to access safeStorage
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  safeStorageInternal = require("electron")?.remote?.safeStorage;
  return safeStorageInternal;
}

// Prefixes distinguish encryption methods at rest.
const DESKTOP_PREFIX = "enc_desk_";
// [Cowork fork] IndexedDB-backed AES-GCM key, replaces the hardcoded-key fallback.
const MOBILE_IDB_PREFIX = "enc_idb_";
// [Upstream legacy] Hardcoded "obsidian-copilot-v1" key + zero IV. Readable from
// source, effectively no encryption. Kept for backward-compat read-only.
const LEGACY_WEBCRYPTO_PREFIX = "enc_web_";
// Very old prefix predating the split; try both desktop & webcrypto.
const LEGACY_ENCRYPTION_PREFIX = "enc_";
const DECRYPTION_PREFIX = "dec_";

// [Upstream legacy] Hardcoded key / zero IV. USED FOR READING OLD TOKENS ONLY.
// New tokens on mobile go through mobileEncryption.ts.
const LEGACY_ENCRYPTION_KEY = new TextEncoder().encode("obsidian-copilot-v1");
const LEGACY_ALGORITHM = { name: "AES-GCM", iv: new Uint8Array(12) };

async function getLegacyKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", LEGACY_ENCRYPTION_KEY, LEGACY_ALGORITHM.name, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptAllKeys(
  settings: Readonly<CopilotSettings>
): Promise<Readonly<CopilotSettings>> {
  if (!settings.enableEncryption) {
    return settings;
  }
  const newSettings = { ...settings };
  const keysToEncrypt = Object.keys(settings).filter(
    (key) =>
      key.toLowerCase().includes("apikey") ||
      key === "plusLicenseKey" ||
      key === "githubCopilotAccessToken" ||
      key === "githubCopilotToken" ||
      key === "claudeOAuthToken"
  );

  for (const key of keysToEncrypt) {
    const apiKey = settings[key as keyof CopilotSettings] as string;
    (newSettings[key as keyof CopilotSettings] as any) = await getEncryptedKey(apiKey);
  }

  if (Array.isArray(settings.activeModels)) {
    newSettings.activeModels = await Promise.all(
      settings.activeModels.map(async (model) => ({
        ...model,
        apiKey: await getEncryptedKey(model.apiKey || ""),
      }))
    );
  }

  if (Array.isArray(settings.activeEmbeddingModels)) {
    newSettings.activeEmbeddingModels = await Promise.all(
      settings.activeEmbeddingModels.map(async (model) => ({
        ...model,
        apiKey: await getEncryptedKey(model.apiKey || ""),
      }))
    );
  }

  return newSettings;
}

/**
 * Encrypt an API key for at-rest storage in data.json.
 *
 * Desktop: Electron safeStorage (OS-keyring).
 * Mobile:  AES-GCM with non-extractable key in IndexedDB + random IV.
 *          (See mobileEncryption.ts)
 *
 * Already-encrypted or plaintext-tagged inputs are returned unchanged.
 */
export async function getEncryptedKey(apiKey: string): Promise<string> {
  if (!apiKey || isAlreadyEncrypted(apiKey)) {
    return apiKey;
  }

  if (isDecrypted(apiKey)) {
    apiKey = apiKey.replace(DECRYPTION_PREFIX, "");
  }

  try {
    // Desktop: OS-keyring backed storage
    if (getSafeStorage()?.isEncryptionAvailable()) {
      const encryptedBuffer = getSafeStorage().encryptString(apiKey) as Buffer;
      return DESKTOP_PREFIX + encryptedBuffer.toString("base64");
    }

    // Mobile: IndexedDB-backed non-extractable key (new mechanism)
    const encoded = await encryptMobile(apiKey);
    return MOBILE_IDB_PREFIX + encoded;
  } catch (error) {
    console.error("Encryption failed:", error);
    return apiKey;
  }
}

/**
 * Decrypt an API key read from data.json. Recognizes the current prefixes
 * (enc_desk_, enc_idb_) and falls back to legacy readers for upstream values
 * (enc_web_, bare enc_). Legacy-encrypted values on mobile will be re-encrypted
 * with the new mechanism the next time encryptAllKeys runs.
 */
export async function getDecryptedKey(apiKey: string): Promise<string> {
  if (!apiKey || isPlainText(apiKey)) {
    return apiKey;
  }
  if (isDecrypted(apiKey)) {
    return apiKey.replace(DECRYPTION_PREFIX, "");
  }

  // Current formats
  if (apiKey.startsWith(DESKTOP_PREFIX)) {
    const base64Data = apiKey.replace(DESKTOP_PREFIX, "");
    const buffer = Buffer.from(base64Data, "base64");
    return getSafeStorage().decryptString(buffer) as string;
  }

  if (apiKey.startsWith(MOBILE_IDB_PREFIX)) {
    return decryptMobile(apiKey.replace(MOBILE_IDB_PREFIX, ""));
  }

  // Legacy: upstream WebCrypto with hardcoded key + zero IV
  if (apiKey.startsWith(LEGACY_WEBCRYPTO_PREFIX)) {
    try {
      const base64Data = apiKey.replace(LEGACY_WEBCRYPTO_PREFIX, "");
      const key = await getLegacyKey();
      const encryptedData = base64ToArrayBuffer(base64Data);
      const decryptedData = await crypto.subtle.decrypt(LEGACY_ALGORITHM, key, encryptedData);
      return new TextDecoder().decode(decryptedData);
    } catch (err) {
      console.error("Legacy webcrypto decryption failed:", err);
      return "Cowork failed to decrypt API keys!";
    }
  }

  // Legacy: very old bare enc_ prefix — try desktop, then webcrypto.
  const base64Data = apiKey.replace(LEGACY_ENCRYPTION_PREFIX, "");
  try {
    if (getSafeStorage()?.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(base64Data, "base64");
        return getSafeStorage().decryptString(buffer) as string;
      } catch {
        // Fall through to webcrypto
      }
    }
    const key = await getLegacyKey();
    const encryptedData = base64ToArrayBuffer(base64Data);
    const decryptedData = await crypto.subtle.decrypt(LEGACY_ALGORITHM, key, encryptedData);
    return new TextDecoder().decode(decryptedData);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "Cowork failed to decrypt API keys!";
  }
}

function isAlreadyEncrypted(key: string): boolean {
  return (
    key.startsWith(DESKTOP_PREFIX) ||
    key.startsWith(MOBILE_IDB_PREFIX) ||
    key.startsWith(LEGACY_WEBCRYPTO_PREFIX) ||
    key.startsWith(LEGACY_ENCRYPTION_PREFIX)
  );
}

function isPlainText(key: string): boolean {
  return !isAlreadyEncrypted(key) && !key.startsWith(DECRYPTION_PREFIX);
}

function isDecrypted(keyBuffer: string): boolean {
  return keyBuffer.startsWith(DECRYPTION_PREFIX);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
