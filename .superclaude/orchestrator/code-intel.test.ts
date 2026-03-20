import { test, expect, describe } from "bun:test";
import {
  extractExports,
  extractImports,
  countTests,
  extractTables,
  renderTaskIntelSummary,
  renderSliceContract,
  type TaskIntel,
  type SliceContract,
} from "./code-intel.ts";

// ─── extractExports ──────────────────────────────────────────

describe("extractExports", () => {
  test("extracts exported functions with signatures", () => {
    const content = `
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}
`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("hashPassword");
    expect(exports[0]!.kind).toBe("function");
    expect(exports[0]!.signature).toContain("password: string");
  });

  test("extracts async functions", () => {
    const content = `
export async function verifyToken(token: string): Promise<TokenPayload> {
  return { userId: "1", email: "test" };
}
`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("verifyToken");
    expect(exports[0]!.kind).toBe("async function");
  });

  test("extracts exported interfaces", () => {
    const content = `
export interface TokenPayload {
  userId: string;
  email: string;
}
`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("TokenPayload");
    expect(exports[0]!.kind).toBe("interface");
  });

  test("extracts exported types", () => {
    const content = `export type UserRole = "admin" | "user";`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("UserRole");
    expect(exports[0]!.kind).toBe("type");
  });

  test("extracts exported consts", () => {
    const content = `export const MAX_RETRIES: number = 3;`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("MAX_RETRIES");
    expect(exports[0]!.kind).toBe("const");
  });

  test("extracts multiple exports from same file", () => {
    const content = `
export interface User { id: string; email: string; }
export function createUser(db: Database, user: NewUser): User {
  return {} as User;
}
export async function findUserByEmail(db: Database, email: string): Promise<User | null> {
  return null;
}
`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(3);
    expect(exports.map(e => e.name).sort()).toEqual(["User", "createUser", "findUserByEmail"]);
  });

  test("ignores non-exported symbols", () => {
    const content = `
const INTERNAL = 42;
function helper() {}
export function publicApi(): void {}
`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.name).toBe("publicApi");
  });
});

// ─── extractImports ──────────────────────────────────────────

describe("extractImports", () => {
  test("extracts named imports from relative paths", () => {
    const content = `import { hashPassword, verifyPassword } from "./auth/password";`;
    const imports = extractImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("hashPassword");
    expect(imports[0]).toContain("./auth/password");
  });

  test("extracts type imports", () => {
    const content = `import type { TokenPayload } from "./auth/jwt";`;
    const imports = extractImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("TokenPayload");
  });

  test("skips node_modules imports", () => {
    const content = `
import { Hono } from "hono";
import type { Context } from "hono";
import { verifyToken } from "./jwt";
`;
    const imports = extractImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("verifyToken");
  });

  test("returns empty for file with no local imports", () => {
    const content = `import { Database } from "bun:sqlite";`;
    const imports = extractImports(content);
    expect(imports).toHaveLength(0);
  });
});

// ─── countTests ──────────────────────────────────────────────

describe("countTests", () => {
  test("counts test() calls", () => {
    const content = `
test("creates user", () => {});
test("finds user", () => {});
test("handles error", () => {});
`;
    expect(countTests(content)).toBe(3);
  });

  test("counts it() calls", () => {
    const content = `
it("should work", () => {});
it("should fail", () => {});
`;
    expect(countTests(content)).toBe(2);
  });

  test("returns 0 for non-test file", () => {
    expect(countTests("export function foo() {}")).toBe(0);
  });
});

// ─── extractTables ───────────────────────────────────────────

describe("extractTables", () => {
  test("extracts CREATE TABLE with columns", () => {
    const sql = `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`;
    const tables = extractTables(sql);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe("users");
    expect(tables[0]!.columns).toContain("id");
    expect(tables[0]!.columns).toContain("email");
    expect(tables[0]!.columns).toContain("password_hash");
    expect(tables[0]!.columns).toContain("created_at");
  });

  test("extracts multiple tables", () => {
    const sql = `
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);
CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT, user_id TEXT);
`;
    const tables = extractTables(sql);
    expect(tables).toHaveLength(2);
    expect(tables.map(t => t.name)).toEqual(["users", "boards"]);
  });

  test("returns empty for no SQL", () => {
    expect(extractTables("export const x = 1;")).toHaveLength(0);
  });
});

// ─── renderTaskIntelSummary ──────────────────────────────────

describe("renderTaskIntelSummary", () => {
  test("renders complete task intel", () => {
    const intel: TaskIntel = {
      task: "T02",
      goal: "Password & JWT Utilities",
      artifacts: [
        {
          path: "playground/src/auth/password.ts",
          exports: [
            { name: "hashPassword", kind: "async function", signature: "hashPassword(password: string): Promise<string>" },
            { name: "verifyPassword", kind: "async function", signature: "verifyPassword(hash: string, password: string): Promise<boolean>" },
          ],
          imports: [],
          lineCount: 19,
        },
      ],
      testFiles: [
        { path: "playground/src/auth/password.test.ts", testCount: 4 },
      ],
    };

    const md = renderTaskIntelSummary(intel);
    expect(md).toContain("Password & JWT Utilities");
    expect(md).toContain("hashPassword");
    expect(md).toContain("verifyPassword");
    expect(md).toContain("19 lines");
    expect(md).toContain("4 tests");
    expect(md).toContain("Total: 4 tests");
  });
});

// ─── renderSliceContract ─────────────────────────────────────

describe("renderSliceContract", () => {
  test("renders contract with exports and tables", () => {
    const contract: SliceContract = {
      slice: "S01",
      milestone: "M001",
      demoSentence: "User can sign up and log in",
      produces: [
        {
          path: "playground/src/auth/jwt.ts",
          exports: [
            { name: "generateToken", kind: "function", signature: "generateToken(payload: TokenPayload): string" },
          ],
          imports: [],
          lineCount: 50,
        },
      ],
      tables: [
        { name: "users", columns: ["id", "email", "password_hash", "created_at"] },
      ],
    };

    const md = renderSliceContract(contract);
    expect(md).toContain("S01");
    expect(md).toContain("User can sign up and log in");
    expect(md).toContain("generateToken");
    expect(md).toContain("| users |");
    expect(md).toContain("password_hash");
  });
});
