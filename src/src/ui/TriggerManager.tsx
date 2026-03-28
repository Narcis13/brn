import { useState, useEffect, useCallback } from "react";
import type { Trigger, TriggerLog, Label, Column, Artifact } from "./api.ts";
import * as api from "./api.ts";

interface TriggerManagerProps {
  boardId: string;
  onClose: () => void;
}

const EVENT_GROUPS: Record<string, string[]> = {
  Card: [
    "card.created", "card.updated", "card.moved", "card.deleted",
    "card.dates_changed", "card.watched", "card.unwatched",
    "card.label_assigned", "card.label_removed",
  ],
  Column: [
    "column.created", "column.updated", "column.deleted", "column.reordered",
  ],
  Comment: ["comment.created", "comment.updated", "comment.deleted"],
  Artifact: [
    "artifact.created", "artifact.updated", "artifact.deleted", "artifact.executed",
  ],
  Board: [
    "board.created", "board.deleted", "board.member_invited", "board.member_removed",
  ],
  Reaction: ["reaction.toggled"],
  Checklist: [
    "checklist.item_added", "checklist.item_checked",
    "checklist.item_unchecked", "checklist.item_removed",
  ],
};

type WizardStep = "list" | "name" | "conditions" | "action" | "review" | "detail";

interface TriggerFormData {
  name: string;
  event_types: string[];
  conditions: { column?: string; label?: string } | null;
  action_type: "webhook" | "run_artifact" | "notify" | "auto_action";
  action_config: Record<string, unknown>;
}

const emptyForm: TriggerFormData = {
  name: "",
  event_types: [],
  conditions: null,
  action_type: "notify",
  action_config: {},
};

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export function TriggerManager({ boardId, onClose }: TriggerManagerProps): React.ReactNode {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [step, setStep] = useState<WizardStep>("list");
  const [form, setForm] = useState<TriggerFormData>({ ...emptyForm });
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [triggerLogs, setTriggerLogs] = useState<TriggerLog[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [boardArtifacts, setBoardArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTriggers = useCallback(async () => {
    try {
      const result = await api.fetchTriggers(boardId);
      setTriggers(result.triggers);
    } catch { /* ignore */ }
  }, [boardId]);

  const loadBoardData = useCallback(async () => {
    try {
      const [colResult, lblResult, artResult] = await Promise.all([
        api.fetchColumns(boardId),
        api.fetchBoardLabels(boardId),
        api.fetchBoardArtifacts(boardId),
      ]);
      setColumns(colResult.columns);
      setLabels(lblResult.labels);
      setBoardArtifacts(artResult.artifacts);
    } catch { /* ignore */ }
  }, [boardId]);

  useEffect(() => {
    loadTriggers();
    loadBoardData();
  }, [loadTriggers, loadBoardData]);

  const handleToggleEnabled = async (trigger: Trigger) => {
    try {
      await api.updateTrigger(boardId, trigger.id, {
        enabled: !trigger.enabled,
      });
      loadTriggers();
    } catch { /* ignore */ }
  };

  const handleDeleteTrigger = async (trigger: Trigger) => {
    if (!confirm(`Delete trigger '${trigger.name}'?`)) return;
    try {
      await api.deleteTrigger(boardId, trigger.id);
      loadTriggers();
      if (selectedTrigger?.id === trigger.id) {
        setSelectedTrigger(null);
        setStep("list");
      }
    } catch { /* ignore */ }
  };

  const handleTestTrigger = async (trigger: Trigger) => {
    try {
      await api.testTrigger(boardId, trigger.id);
    } catch { /* ignore */ }
  };

  const handleViewDetail = async (trigger: Trigger) => {
    setSelectedTrigger(trigger);
    try {
      const result = await api.fetchTriggerLogs(boardId, trigger.id, 20);
      setTriggerLogs(result.logs);
    } catch { /* ignore */ }
    setStep("detail");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (form.event_types.length === 0) {
      setError("Select at least one event type");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.createTrigger(boardId, {
        name: form.name.trim(),
        event_types: form.event_types,
        conditions: form.conditions,
        action_type: form.action_type,
        action_config: form.action_config,
      });
      setForm({ ...emptyForm });
      setStep("list");
      loadTriggers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trigger");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    setForm({ ...emptyForm });
    setError("");
    setStep("name");
  };

  // Render functions for each step

  const renderList = () => (
    <div className="trigger-list-view">
      <div className="trigger-list-header">
        <h3>Triggers</h3>
        <button className="trigger-create-btn" onClick={startCreate}>
          + New Trigger
        </button>
      </div>

      {triggers.length === 0 ? (
        <div className="trigger-empty">
          No triggers configured. Create one to automate your board.
        </div>
      ) : (
        <div className="trigger-list">
          {triggers.map((t) => {
            const eventTypes: string[] = JSON.parse(t.event_types);
            return (
              <div key={t.id} className="trigger-list-item">
                <div className="trigger-item-info">
                  <div className="trigger-item-name">{t.name}</div>
                  <div className="trigger-item-meta">
                    <span className="trigger-item-events">
                      {eventTypes.slice(0, 2).map((e) => (
                        <span key={e} className="trigger-event-chip">{e}</span>
                      ))}
                      {eventTypes.length > 2 && (
                        <span className="trigger-event-chip">+{eventTypes.length - 2}</span>
                      )}
                    </span>
                    <span className={`trigger-action-badge trigger-action-${t.action_type}`}>
                      {t.action_type.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <div className="trigger-item-actions">
                  <label className="trigger-toggle">
                    <input
                      type="checkbox"
                      checked={!!t.enabled}
                      onChange={() => handleToggleEnabled(t)}
                    />
                    <span className="trigger-toggle-label">
                      {t.enabled ? "On" : "Off"}
                    </span>
                  </label>
                  <button
                    className="trigger-action-btn"
                    onClick={() => handleViewDetail(t)}
                    title="View details"
                  >
                    Details
                  </button>
                  <button
                    className="trigger-action-btn"
                    onClick={() => handleTestTrigger(t)}
                    title="Fire test event"
                  >
                    Test
                  </button>
                  <button
                    className="trigger-action-btn trigger-delete-btn"
                    onClick={() => handleDeleteTrigger(t)}
                    title="Delete trigger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderNameStep = () => (
    <div className="trigger-wizard-step">
      <h3>Step 1: Name & Events</h3>
      <div className="trigger-form-field">
        <label>Trigger Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., Notify on card move"
          maxLength={100}
        />
      </div>
      <div className="trigger-form-field">
        <label>Event Types</label>
        <div className="trigger-event-groups">
          {Object.entries(EVENT_GROUPS).map(([group, events]) => (
            <div key={group} className="trigger-event-group">
              <div className="trigger-event-group-name">{group}</div>
              {events.map((evt) => (
                <label key={evt} className="trigger-event-option">
                  <input
                    type="checkbox"
                    checked={form.event_types.includes(evt)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm({ ...form, event_types: [...form.event_types, evt] });
                      } else {
                        setForm({
                          ...form,
                          event_types: form.event_types.filter((t) => t !== evt),
                        });
                      }
                    }}
                  />
                  <span>{evt}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
      {error && <div className="trigger-error">{error}</div>}
      <div className="trigger-wizard-nav">
        <button onClick={() => setStep("list")}>Cancel</button>
        <button
          className="trigger-primary-btn"
          onClick={() => {
            if (!form.name.trim()) { setError("Name is required"); return; }
            if (form.event_types.length === 0) { setError("Select at least one event"); return; }
            setError("");
            setStep("conditions");
          }}
        >
          Next
        </button>
      </div>
    </div>
  );

  const renderConditionsStep = () => (
    <div className="trigger-wizard-step">
      <h3>Step 2: Conditions (optional)</h3>
      <p className="trigger-hint">Only fire when these conditions match.</p>
      <div className="trigger-form-field">
        <label>Column</label>
        <select
          value={form.conditions?.column ?? ""}
          onChange={(e) => {
            const val = e.target.value || undefined;
            setForm({
              ...form,
              conditions: val || form.conditions?.label
                ? { ...form.conditions, column: val }
                : null,
            });
          }}
        >
          <option value="">Any column</option>
          {columns.map((c) => (
            <option key={c.id} value={c.title}>{c.title}</option>
          ))}
        </select>
      </div>
      <div className="trigger-form-field">
        <label>Label</label>
        <select
          value={form.conditions?.label ?? ""}
          onChange={(e) => {
            const val = e.target.value || undefined;
            setForm({
              ...form,
              conditions: val || form.conditions?.column
                ? { ...form.conditions, label: val }
                : null,
            });
          }}
        >
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l.id} value={l.name}>{l.name}</option>
          ))}
        </select>
      </div>
      <div className="trigger-wizard-nav">
        <button onClick={() => setStep("name")}>Back</button>
        <button className="trigger-primary-btn" onClick={() => setStep("action")}>
          Next
        </button>
      </div>
    </div>
  );

  const renderActionStep = () => (
    <div className="trigger-wizard-step">
      <h3>Step 3: Action</h3>
      <div className="trigger-form-field">
        <label>Action Type</label>
        <div className="trigger-action-options">
          {(["webhook", "run_artifact", "notify", "auto_action"] as const).map((type) => (
            <label key={type} className="trigger-action-radio">
              <input
                type="radio"
                name="action_type"
                checked={form.action_type === type}
                onChange={() => setForm({ ...form, action_type: type, action_config: {} })}
              />
              <span>{type.replace("_", " ")}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Action-specific config */}
      {form.action_type === "webhook" && (
        <div className="trigger-form-field">
          <label>Webhook URL</label>
          <input
            type="url"
            value={(form.action_config.url as string) ?? ""}
            onChange={(e) =>
              setForm({ ...form, action_config: { ...form.action_config, url: e.target.value } })
            }
            placeholder="https://..."
          />
        </div>
      )}

      {form.action_type === "run_artifact" && (
        <div className="trigger-form-field">
          <label>Board Artifact</label>
          <select
            value={(form.action_config.artifactId as string) ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                action_config: { artifactId: e.target.value },
              })
            }
          >
            <option value="">Select artifact...</option>
            {boardArtifacts
              .filter((a) => ["sh", "js", "ts"].includes(a.filetype))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename} ({a.filetype})
                </option>
              ))}
          </select>
        </div>
      )}

      {form.action_type === "notify" && (
        <div className="trigger-form-field">
          <label>Notify</label>
          <div className="trigger-action-options">
            {(["watchers", "members", "owner"] as const).map((target) => (
              <label key={target} className="trigger-action-radio">
                <input
                  type="radio"
                  name="notify_target"
                  checked={(form.action_config.target as string) === target}
                  onChange={() =>
                    setForm({ ...form, action_config: { target } })
                  }
                />
                <span>{target}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {form.action_type === "auto_action" && (
        <>
          <div className="trigger-form-field">
            <label>Action</label>
            <select
              value={(form.action_config.action as string) ?? ""}
              onChange={(e) => {
                const action = e.target.value;
                setForm({
                  ...form,
                  action_config: { action },
                });
              }}
            >
              <option value="">Select action...</option>
              <option value="move_card">Move card</option>
              <option value="assign_label">Assign label</option>
              <option value="remove_label">Remove label</option>
            </select>
          </div>

          {form.action_config.action === "move_card" && (
            <div className="trigger-form-field">
              <label>Target Column</label>
              <select
                value={(form.action_config.targetColumn as string) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action_config: { ...form.action_config, targetColumn: e.target.value },
                  })
                }
              >
                <option value="">Select column...</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.title}>{c.title}</option>
                ))}
              </select>
            </div>
          )}

          {(form.action_config.action === "assign_label" ||
            form.action_config.action === "remove_label") && (
            <div className="trigger-form-field">
              <label>Label</label>
              <select
                value={(form.action_config.labelName as string) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action_config: { ...form.action_config, labelName: e.target.value },
                  })
                }
              >
                <option value="">Select label...</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {error && <div className="trigger-error">{error}</div>}
      <div className="trigger-wizard-nav">
        <button onClick={() => setStep("conditions")}>Back</button>
        <button className="trigger-primary-btn" onClick={() => {
          setError("");
          setStep("review");
        }}>
          Next
        </button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="trigger-wizard-step">
      <h3>Step 4: Review & Save</h3>
      <div className="trigger-review">
        <div className="trigger-review-row">
          <strong>Name:</strong> {form.name}
        </div>
        <div className="trigger-review-row">
          <strong>Events:</strong>{" "}
          {form.event_types.map((e) => (
            <span key={e} className="trigger-event-chip">{e}</span>
          ))}
        </div>
        {form.conditions && (
          <div className="trigger-review-row">
            <strong>Conditions:</strong>{" "}
            {form.conditions.column && `Column: ${form.conditions.column}`}
            {form.conditions.column && form.conditions.label && ", "}
            {form.conditions.label && `Label: ${form.conditions.label}`}
          </div>
        )}
        <div className="trigger-review-row">
          <strong>Action:</strong> {form.action_type.replace("_", " ")}
        </div>
        <div className="trigger-review-row">
          <strong>Config:</strong>{" "}
          <code>{JSON.stringify(form.action_config)}</code>
        </div>
      </div>
      {error && <div className="trigger-error">{error}</div>}
      <div className="trigger-wizard-nav">
        <button onClick={() => setStep("action")}>Back</button>
        <button
          className="trigger-primary-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Create Trigger"}
        </button>
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!selectedTrigger) return null;
    const eventTypes: string[] = JSON.parse(selectedTrigger.event_types);
    const config = JSON.parse(selectedTrigger.action_config);

    return (
      <div className="trigger-detail-view">
        <div className="trigger-detail-header">
          <h3>{selectedTrigger.name}</h3>
          <button onClick={() => { setSelectedTrigger(null); setStep("list"); }}>
            Back to list
          </button>
        </div>

        <div className="trigger-detail-info">
          <div><strong>Status:</strong> {selectedTrigger.enabled ? "Enabled" : "Disabled"}</div>
          <div>
            <strong>Events:</strong>{" "}
            {eventTypes.map((e) => (
              <span key={e} className="trigger-event-chip">{e}</span>
            ))}
          </div>
          <div><strong>Action:</strong> {selectedTrigger.action_type.replace("_", " ")}</div>
          <div><strong>Config:</strong> <code>{JSON.stringify(config, null, 2)}</code></div>
          <div><strong>Created:</strong> {formatDateTime(selectedTrigger.created_at)}</div>
        </div>

        <h4>Execution Log</h4>
        {triggerLogs.length === 0 ? (
          <div className="trigger-empty">No executions yet</div>
        ) : (
          <table className="trigger-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Result</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {triggerLogs.map((log) => (
                <tr key={log.id} className={log.result === "error" ? "trigger-log-error" : ""}>
                  <td>{formatDateTime(log.executed_at)}</td>
                  <td>{log.event_type}</td>
                  <td className={`trigger-log-${log.result}`}>{log.result}</td>
                  <td>{log.duration_ms}ms</td>
                  <td className="trigger-log-error-cell">
                    {log.error_message ? log.error_message.slice(0, 100) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="trigger-manager-overlay" onClick={onClose}>
      <div
        className="trigger-manager-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trigger-manager-header">
          <h2>Board Settings</h2>
          <button className="trigger-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="trigger-manager-body">
          {step === "list" && renderList()}
          {step === "name" && renderNameStep()}
          {step === "conditions" && renderConditionsStep()}
          {step === "action" && renderActionStep()}
          {step === "review" && renderReviewStep()}
          {step === "detail" && renderDetail()}
        </div>
      </div>
    </div>
  );
}
