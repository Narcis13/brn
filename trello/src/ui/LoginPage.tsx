import { useState } from "react";
import type { User } from "./api.ts";
import * as api from "./api.ts";

interface LoginPageProps {
  onAuth: (user: User) => void;
}

export function LoginPage({ onAuth }: LoginPageProps): React.ReactElement {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError("Username is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "register"
          ? await api.register(trimmedUser, password)
          : await api.login(trimmedUser, password);

      api.setToken(result.token);
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode(): void {
    setMode(mode === "login" ? "register" : "login");
    setError("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>{mode === "login" ? "Log in" : "Create account"}</h2>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            autoComplete="username"
            autoFocus
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === "register" ? "Min 6 characters" : "Enter password"
            }
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Log in"
                : "Register"}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === "login"
            ? "Don't have an account? "
            : "Already have an account? "}
          <button type="button" className="auth-toggle-btn" onClick={toggleMode}>
            {mode === "login" ? "Register" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
