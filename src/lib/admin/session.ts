export const ADMIN_COOKIE = 'nv_admin';
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(secret: string, ttlMs = 12 * 3600 * 1000): Promise<string> {
  const data = bytesToB64url(enc.encode(JSON.stringify({ exp: Date.now() + ttlMs })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
  return `${data}.${bytesToB64url(sig)}`;
}
export async function verifySession(secret: string, token?: string | null): Promise<boolean> {
  if (!secret || !token || !token.includes('.')) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(sig), enc.encode(data));
    if (!ok) return false;
    const payload = JSON.parse(dec.decode(b64urlToBytes(data)));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch { return false; }
}
