import { useState, useEffect, useRef } from "react";
import type { Artifact, User } from "./api.ts";
import * as api from "./api.ts";
import { formatActivityTimestamp } from "./card-utils.ts";

interface BoardArtifactsProps {
  boardId: string;
  currentUser: User;
  isOwner: boolean;
  isMember: boolean;
  onClose: () => void;
}

function getFiletypeIcon(filetype: Artifact["filetype"]): string {
  switch (filetype) {
    case "md": return "📝";
    case "html": return "🌐";
    case "js": return "📜";
    case "ts": return "📘";
    case "sh": return "⚡";
    default: return "📄";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export function BoardArtifacts({
  boardId,
  currentUser,
  isOwner,
  isMember,
  onClose,
}: BoardArtifactsProps): React.ReactElement {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArtifactForm, setShowArtifactForm] = useState(false);
  const [artifactFilename, setArtifactFilename] = useState("");
  const [artifactFiletype, setArtifactFiletype] = useState<Artifact["filetype"]>("md");
  const [artifactContent, setArtifactContent] = useState("");
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [expandedArtifactContent, setExpandedArtifactContent] = useState<string>("");
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [editingArtifactContent, setEditingArtifactContent] = useState("");
  const [runningArtifact, setRunningArtifact] = useState<string | null>(null);
  const [artifactRunOutput, setArtifactRunOutput] = useState<{ output: string; exitCode: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    void loadArtifacts();
  }, [boardId]);

  async function loadArtifacts(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const { artifacts: boardArtifacts } = await api.fetchBoardArtifacts(boardId);
      setArtifacts(boardArtifacts);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadArtifactContent(artifactId: string): Promise<void> {
    try {
      const artifact = await api.fetchArtifact(boardId, artifactId);
      setExpandedArtifactContent(artifact.content || "");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function createArtifact(): Promise<void> {
    if (!artifactFilename.trim() || !artifactContent.trim()) return;

    try {
      const created = await api.createBoardArtifact(
        boardId,
        artifactFilename.trim(),
        artifactFiletype,
        artifactContent.trim()
      );
      
      // Update local state
      setArtifacts([...artifacts, created].sort((a, b) => a.position - b.position));
      
      // Reset form
      setShowArtifactForm(false);
      setArtifactFilename("");
      setArtifactContent("");
      setArtifactFiletype("md");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function updateArtifact(artifactId: string, content: string): Promise<void> {
    try {
      const updated = await api.updateArtifact(boardId, artifactId, { content });
      
      // Update local state
      setArtifacts(artifacts.map(a => 
        a.id === artifactId ? { ...a, ...updated } : a
      ));
      
      // Reset editing state
      setEditingArtifact(null);
      setEditingArtifactContent("");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteArtifact(artifactId: string): Promise<void> {
    if (!confirm("Delete this artifact?")) return;
    
    try {
      await api.deleteArtifact(boardId, artifactId);
      
      // Update local state
      setArtifacts(artifacts.filter(a => a.id !== artifactId));
      
      // Reset expanded state if this was the expanded artifact
      if (expandedArtifact === artifactId) {
        setExpandedArtifact(null);
        setExpandedArtifactContent("");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  const canEdit = isMember || isOwner;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        ref={modalRef}
        className="modal board-artifacts-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="board-artifacts-header">
          <h2>Board Documents</h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {error && <p className="modal-inline-error">{error}</p>}

        <div className="board-artifacts-body">
          {loading ? (
            <div className="board-artifacts-loading">Loading artifacts...</div>
          ) : (
            <>
              {!artifacts.length && !showArtifactForm ? (
                <div className="artifact-empty-state">
                  <p className="empty-inline-state">No board documents</p>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => setShowArtifactForm(true)}
                    >
                      Add Document
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {showArtifactForm ? (
                    <div className="artifact-form">
                      <div className="artifact-form-row">
                        <input
                          type="text"
                          placeholder="filename.md"
                          value={artifactFilename}
                          onChange={(e) => setArtifactFilename(e.target.value)}
                          className="artifact-filename-input"
                        />
                        <select
                          value={artifactFiletype}
                          onChange={(e) => setArtifactFiletype(e.target.value as Artifact["filetype"])}
                          className="artifact-type-select"
                        >
                          <option value="md">Markdown (.md)</option>
                          <option value="html">HTML (.html)</option>
                          <option value="js">JavaScript (.js)</option>
                          <option value="ts">TypeScript (.ts)</option>
                          <option value="sh">Shell (.sh)</option>
                        </select>
                      </div>
                      <textarea
                        className="artifact-content-textarea"
                        placeholder="Enter content..."
                        value={artifactContent}
                        onChange={(e) => setArtifactContent(e.target.value)}
                        rows={10}
                      />
                      <div className="artifact-form-actions">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => void createArtifact()}
                          disabled={!artifactFilename.trim() || !artifactContent.trim()}
                        >
                          Save Document
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setShowArtifactForm(false);
                            setArtifactFilename("");
                            setArtifactContent("");
                            setArtifactFiletype("md");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="artifact-list">
                        {artifacts.map((artifact) => (
                          <div key={artifact.id} className="artifact-item">
                            <div
                              className="artifact-header"
                              onClick={() => {
                                if (expandedArtifact === artifact.id) {
                                  setExpandedArtifact(null);
                                  setExpandedArtifactContent("");
                                } else {
                                  setExpandedArtifact(artifact.id);
                                  void loadArtifactContent(artifact.id);
                                }
                              }}
                            >
                              <span className="artifact-icon">{getFiletypeIcon(artifact.filetype)}</span>
                              <span className="artifact-filename">{artifact.filename}</span>
                              <span className="artifact-meta">
                                {artifact.filetype.toUpperCase()} • {formatActivityTimestamp(artifact.created_at)}
                              </span>
                              {canEdit && (
                                <div className="artifact-actions">
                                  {["sh", "js", "ts"].includes(artifact.filetype) && (
                                    <button
                                      type="button"
                                      className="btn-icon btn-sm"
                                      title="Run"
                                      disabled={runningArtifact === artifact.id}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setRunningArtifact(artifact.id);
                                        setArtifactRunOutput(null);
                                        setExpandedArtifact(artifact.id);
                                        try {
                                          const result = await api.runArtifact(boardId, artifact.id);
                                          setArtifactRunOutput(result);
                                        } catch (err) {
                                          setArtifactRunOutput({ output: err instanceof Error ? err.message : "Run failed", exitCode: 1 });
                                        } finally {
                                          setRunningArtifact(null);
                                        }
                                      }}
                                    >
                                      {runningArtifact === artifact.id ? "..." : "▶️"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-icon btn-sm"
                                    title="Edit"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setEditingArtifact(artifact);
                                      if (expandedArtifact !== artifact.id) {
                                        const fullArtifact = await api.fetchArtifact(boardId, artifact.id);
                                        setExpandedArtifact(artifact.id);
                                        setExpandedArtifactContent(fullArtifact.content || "");
                                        setEditingArtifactContent(fullArtifact.content || "");
                                      } else {
                                        setEditingArtifactContent(expandedArtifactContent);
                                      }
                                    }}
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon btn-sm"
                                    title="Delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void deleteArtifact(artifact.id);
                                    }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                            {expandedArtifact === artifact.id && (
                              <div className="artifact-content">
                                {editingArtifact?.id === artifact.id ? (
                                  <>
                                    <textarea
                                      className="artifact-content-textarea"
                                      value={editingArtifactContent}
                                      onChange={(e) => setEditingArtifactContent(e.target.value)}
                                      rows={15}
                                    />
                                    <div className="artifact-edit-actions">
                                      <button
                                        type="button"
                                        className="btn-primary btn-sm"
                                        onClick={() => void updateArtifact(artifact.id, editingArtifactContent)}
                                        disabled={!editingArtifactContent.trim()}
                                      >
                                        Save Changes
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        onClick={() => {
                                          setEditingArtifact(null);
                                          setEditingArtifactContent("");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <pre className="artifact-content-display">{expandedArtifactContent}</pre>
                                )}
                                {artifactRunOutput && expandedArtifact === artifact.id && (
                                  <div className={`artifact-run-output ${artifactRunOutput.exitCode === 0 ? "run-success" : "run-error"}`}>
                                    <div className="run-output-header">
                                      <span>{artifactRunOutput.exitCode === 0 ? "Output" : `Error (exit code ${artifactRunOutput.exitCode})`}</span>
                                      <button
                                        type="button"
                                        className="btn-icon btn-sm"
                                        onClick={() => setArtifactRunOutput(null)}
                                      >
                                        x
                                      </button>
                                    </div>
                                    <pre className="run-output-content">{artifactRunOutput.output || "(no output)"}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn-primary btn-sm artifact-add-btn"
                          onClick={() => setShowArtifactForm(true)}
                        >
                          Add Document
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}