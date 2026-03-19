export interface TokenPayload {
  userId: string;
  email: string;
}

interface JWTPayload extends TokenPayload {
  exp?: number;
  iat?: number;
}

const ALGORITHM = "HS256";
const HMAC_BLOCK_SIZE = 64;
const DEFAULT_EXPIRATION = "24h";

export function generateToken(payload: TokenPayload, expiresIn: string = DEFAULT_EXPIRATION): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiration = parseExpiration(expiresIn);
  
  const jwtPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiration
  };

  return createJWT(jwtPayload, secret);
}

export function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const decoded = parseJWT(token, secret);
    if (!decoded) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return null;
    }

    return {
      userId: decoded.userId,
      email: decoded.email
    };
  } catch {
    return null;
  }
}

function parseExpiration(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error("Invalid expiration format");
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: throw new Error("Invalid time unit");
  }
}

function createJWT(payload: JWTPayload, secret: string): string {
  const header = {
    alg: ALGORITHM,
    typ: "JWT"
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = encoder.encode(secret);
  
  const signature = createHmacSignature(data, key);
  const encodedSignature = base64UrlEncode(signature);
  
  return `${message}.${encodedSignature}`;
}

function parseJWT(token: string, secret: string): JWTPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const message = `${encodedHeader}.${encodedPayload}`;
  
  // Verify signature
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = encoder.encode(secret);
  
  const signature = createHmacSignature(data, key);
  const expectedSignature = base64UrlEncode(signature);
  
  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return payload;
  } catch {
    return null;
  }
}

function createHmacSignature(data: Uint8Array, key: Uint8Array): ArrayBuffer {
  // HMAC-SHA256 implementation
  const adjustedKey = new Uint8Array(HMAC_BLOCK_SIZE);
  
  if (key.length > HMAC_BLOCK_SIZE) {
    // If key is longer than block size, hash it
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(key);
    const hashedKey = hasher.digest();
    adjustedKey.set(new Uint8Array(hashedKey), 0);
  } else {
    adjustedKey.set(key, 0);
  }
  
  const ipad = new Uint8Array(HMAC_BLOCK_SIZE);
  const opad = new Uint8Array(HMAC_BLOCK_SIZE);
  
  for (let i = 0; i < HMAC_BLOCK_SIZE; i++) {
    ipad[i] = adjustedKey[i] ^ 0x36;
    opad[i] = adjustedKey[i] ^ 0x5c;
  }
  
  // Inner hash: H(K XOR ipad, message)
  const innerHasher = new Bun.CryptoHasher("sha256");
  innerHasher.update(ipad);
  innerHasher.update(data);
  const innerHash = innerHasher.digest();
  
  // Outer hash: H(K XOR opad, inner_hash)
  const outerHasher = new Bun.CryptoHasher("sha256");
  outerHasher.update(opad);
  outerHasher.update(innerHash);
  
  return outerHasher.digest().buffer;
}

function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string;
  
  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    const binaryString = bytes.reduce((str, byte) => str + String.fromCharCode(byte), '');
    base64 = btoa(binaryString);
  }
  
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(input: string): string {
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + (4 - (input.length % 4)) % 4, '=');
  
  return atob(base64);
}