const BCRYPT_COST = 10;
const EMPTY_PASSWORD_PLACEHOLDER = "__empty__";

export async function hashPassword(password: string): Promise<string> {
  // Bun.password.hash throws on empty password, so use placeholder
  const passwordToHash = password === "" ? EMPTY_PASSWORD_PLACEHOLDER : password;
  
  return await Bun.password.hash(passwordToHash, {
    algorithm: "bcrypt",
    cost: BCRYPT_COST
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  // Use placeholder for empty password to match hashing behavior
  const passwordToVerify = password === "" ? EMPTY_PASSWORD_PLACEHOLDER : password;
  
  return await Bun.password.verify(passwordToVerify, hash);
}