import { useState, useEffect, useCallback } from "react";
import type { User, Board } from "./api.ts";
import * as api from "./api.ts";
import { LoginPage } from "./LoginPage.tsx";
import { BoardList } from "./BoardList.tsx";
import { BoardView } from "./BoardView.tsx";

type View =
  | { kind: "checking" }
  | { kind: "login" }
  | { kind: "board-list" }
  | { kind: "board"; board: Board };

export function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: "checking" });
  const [user, setUser] = useState<User | null>(null);

  const goToLogin = useCallback((): void => {
    setUser(null);
    setView({ kind: "login" });
  }, []);

  // On mount: check if we have a valid token
  useEffect(() => {
    api.setOnUnauthorized(goToLogin);

    const token = api.getToken();
    if (!token) {
      setView({ kind: "login" });
      return;
    }

    api
      .getMe()
      .then((me) => {
        setUser(me);
        setView({ kind: "board-list" });
      })
      .catch(() => {
        api.clearToken();
        setView({ kind: "login" });
      });
  }, [goToLogin]);

  function handleAuth(authedUser: User): void {
    setUser(authedUser);
    setView({ kind: "board-list" });
  }

  function handleLogout(): void {
    api.clearToken();
    setUser(null);
    setView({ kind: "login" });
  }

  function handleSelectBoard(board: Board): void {
    setView({ kind: "board", board });
  }

  function handleBackToList(): void {
    setView({ kind: "board-list" });
  }

  // --- Render ---

  if (view.kind === "checking") {
    return (
      <div className="auth-page">
        <p className="auth-loading">Loading...</p>
      </div>
    );
  }

  if (view.kind === "login") {
    return <LoginPage onAuth={handleAuth} />;
  }

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          {view.kind === "board" && (
            <button className="header-back" onClick={handleBackToList}>
              &larr; Boards
            </button>
          )}
          <h1>
            {view.kind === "board" ? view.board.title : "My Boards"}
          </h1>
        </div>
        <div className="header-right">
          <span className="header-username">{user?.username}</span>
          <button className="btn-secondary btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main id="main-content">
        {view.kind === "board-list" && (
          <BoardList onSelectBoard={handleSelectBoard} />
        )}
        {view.kind === "board" && user && (
          <BoardView boardId={view.board.id} currentUser={user} />
        )}
      </main>
    </>
  );
}
