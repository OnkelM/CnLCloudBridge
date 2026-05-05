const enc = new TextEncoder();

export function utf8(str) {
  return enc.encode(str);
}

export function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(data) {
  const buf = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

export async function deriveSecret(email, password, domain) {
  return sha256(email.toLowerCase() + password + domain.toLowerCase());
}

export async function updateToken(oldToken, newTokenHex) {
  const concat = new Uint8Array(oldToken.length + newTokenHex.length);
  concat.set(oldToken, 0);
  concat.set(utf8(newTokenHex), oldToken.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", concat));
}

export async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8(message));
  return bytesToHex(sig);
}

export async function aesCbcDecrypt(secret, base64Cipher) {
  const iv = secret.slice(0, 16);
  const keyBytes = secret.slice(16, 32);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const cipher = base64ToBytes(base64Cipher);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
  return new TextDecoder().decode(plain);
}

export async function aesCbcEncrypt(secret, plaintext) {
  const iv = secret.slice(0, 16);
  const keyBytes = secret.slice(16, 32);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, utf8(plaintext)),
  );
  return bytesToBase64(cipher);
}

export async function aesCbcDecryptRaw(keyHex, base64Cipher) {
  const keyBytes = hexToBytes(keyHex);
  const iv = keyBytes;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const cipher = base64ToBytes(base64Cipher);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
  return new TextDecoder().decode(plain);
}
