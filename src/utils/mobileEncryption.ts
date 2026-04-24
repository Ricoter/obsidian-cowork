/**
 * [Cowork fork] Mobile-safe encryption for API keys stored in data.json.
 *
 * Upstream stored a hardcoded AES key ("obsidian-copilot-v1") with an all-zero
 * IV in the plugin source — which meant anyone with the vault's data.json could
 * decrypt every API key in five lines of code. On desktop this was mitigated by
 * Electron's safeStorage (OS-keyring), but mobile had no fallback.
 *
 * This module replaces the mobile path with:
 * - A random AES-GCM 256 key generated per install, stored in IndexedDB with
 *   `extractable: false` so the runtime can use it but cannot dump its bytes.
 * - A random 12-byte IV per encryption, prepended to the ciphertext.
 *
 * The encrypted blob format (base64-encoded after the `enc_idb_` prefix):
 *   [12 bytes IV][ciphertext + GCM tag]
 *
 * Security properties:
 * - Decryption of a leaked data.json requires access to the device's IndexedDB
 *   store, which is sandboxed per-app on iOS/Android and not included in
 *   iCloud/Google vault sync.
 * - Losing IndexedDB (plugin reinstall, app data wipe) means the user has to
 *   re-enter their API keys. Documented as expected.
 *
 * Does NOT protect against a rooted/jailbroken device or a malicious build of
 * Obsidian. For that threat model, use the homeserver-proxy pattern instead.
 */

const DB_NAME = "cowork-encryption";
const STORE_NAME = "keys";
const KEY_ID = "default";
const IV_LENGTH = 12;

let cachedKey: CryptoKey | null = null;

/**
 * Open (or create) the IndexedDB database used for the encryption key.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Try to load the persisted key from IndexedDB. Returns null if missing.
 */
async function loadKey(): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_ID);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
  });
}

/**
 * Persist the non-extractable key in IndexedDB. Browsers allow storing
 * CryptoKey objects directly via structured clone.
 */
async function persistKey(key: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(key, KEY_ID);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Get the mobile encryption key, generating and persisting it on first use.
 * Throws if IndexedDB is unavailable.
 */
export async function getMobileKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable; cannot use mobile encryption");
  }

  const existing = await loadKey();
  if (existing) {
    cachedKey = existing;
    return existing;
  }

  const fresh = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: can be used but not exported
    ["encrypt", "decrypt"]
  );
  await persistKey(fresh);
  cachedKey = fresh;
  return fresh;
}

/**
 * Encode bytes as base64. Uses btoa to stay within the Obsidian mobile
 * WebView's allowed surface.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt a UTF-8 string with the mobile key. Returns base64(IV ∥ ciphertext).
 */
export async function encryptMobile(plaintext: string): Promise<string> {
  const key = await getMobileKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return toBase64(combined);
}

/**
 * Decrypt a mobile-encrypted blob produced by encryptMobile.
 */
export async function decryptMobile(encoded: string): Promise<string> {
  const key = await getMobileKey();
  const combined = fromBase64(encoded);
  const iv = combined.subarray(0, IV_LENGTH);
  const cipher = combined.subarray(IV_LENGTH);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}
