"use client";

import { useState, useEffect, useCallback } from "react";
import { triggerWorkflows, getWorkflowStatus } from "./actions";

type WorkflowStatus = {
  runId: string;
  state: "RUN_STARTED" | "RUN_SUCCESS" | "RUN_FAILED" | "RUN_CANCELED";
  createdAt: number;
  completedAt?: number;
  hasStarted: boolean;
  hasFinishedWork: boolean;
};

type StatusResponse = {
  summary: {
    totalRuns: number;
    completed: number;
    subTotal: number;
    subCompleted: number;
    allComplete: boolean;
    currentConcurrent: number;
    maxConcurrentObserved: number;
    parallelismLimit: number;
    parallelismRespected: boolean;
    verdict: string;
  };
  workflows: WorkflowStatus[];
  subWorkflows: WorkflowStatus[];
};

export default function Home() {
  const [triggeredIds, setTriggeredIds] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (triggeredIds.length === 0) return;
    try {
      const data = await getWorkflowStatus(triggeredIds);
      if (data.summary) {
        setStatus(data);
        if (data.summary.allComplete) {
          setPolling(false);
        }
      }
    } catch {
      // ignore transient errors
    }
  }, [triggeredIds]);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [polling, poll]);

  const trigger = async () => {
    setTriggering(true);
    setError(null);
    setStatus(null);
    try {
      const data = await triggerWorkflows();
      setTriggeredIds(data.workflowRunIds);
      setPolling(true);
      // initial poll after short delay
      setTimeout(poll, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTriggering(false);
    }
  };

  const getStateLabel = (w: WorkflowStatus) => {
    if (w.state === "RUN_SUCCESS") return "completed";
    if (w.state === "RUN_FAILED") return "failed";
    if (w.state === "RUN_CANCELED") return "canceled";
    if (w.hasStarted && !w.hasFinishedWork) return "executing";
    if (w.hasStarted) return "finishing";
    return "queued";
  };

  const getStateColor = (label: string) => {
    switch (label) {
      case "completed": return "#22c55e";
      case "executing": return "#3b82f6";
      case "finishing": return "#8b5cf6";
      case "queued":    return "#eab308";
      case "failed":    return "#ef4444";
      case "canceled":  return "#6b7280";
      default:          return "#6b7280";
    }
  };

  const executingCount = status?.summary.currentConcurrent ?? 0;

  return (
    <main style={{ fontFamily: "system-ui, monospace", padding: "2rem", maxWidth: "800px", color: "var(--text)" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Parallelism Test</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        Triggers 40 workflows with <code>flowControl.parallelism = 5</code>.
        Each workflow invokes a sub-workflow with the same flow control key.
        Max concurrency should never exceed 5.
      </p>

      <button
        onClick={trigger}
        disabled={triggering}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          background: triggering ? "var(--btn-disabled)" : "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: triggering ? "not-allowed" : "pointer",
          marginBottom: "1.5rem",
        }}
      >
        {triggering ? "Triggering..." : "Trigger 40 Workflows"}
      </button>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: "1rem" }}>
          Error: {error}
        </div>
      )}

      {triggeredIds.length > 0 && !status && polling && (
        <p style={{ color: "var(--text-muted)" }}>Waiting for workflows to appear in logs...</p>
      )}

      {status && (
        <>
          {/* Summary bar */}
          <div style={{
            display: "flex",
            gap: "1.5rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
          }}>
            <Stat label="Main runs" value={status.summary.totalRuns} />
            <Stat label="Main done" value={status.summary.completed} />
            <Stat label="Sub runs" value={status.summary.subTotal} />
            <Stat label="Sub done" value={status.summary.subCompleted} />
            <Stat label="Executing now" value={executingCount} color="#3b82f6" />
            <Stat
              label="Max concurrent"
              value={status.summary.maxConcurrentObserved}
              color={status.summary.parallelismRespected ? "#22c55e" : "#ef4444"}
            />
            <Stat label="Limit" value={status.summary.parallelismLimit} />
          </div>

          {/* Verdict */}
          <div style={{
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            fontWeight: "bold",
            background: status.summary.parallelismRespected ? "var(--pass-bg)" : "var(--fail-bg)",
            color: status.summary.parallelismRespected ? "var(--pass-text)" : "var(--fail-text)",
            border: `1px solid ${status.summary.parallelismRespected ? "var(--pass-border)" : "var(--fail-border)"}`,
          }}>
            {status.summary.verdict}
          </div>

          {/* Main workflow grid */}
          <h3 style={{ marginBottom: "0.5rem" }}>Main Workflows</h3>
          <WorkflowGrid workflows={status.workflows} getStateLabel={getStateLabel} getStateColor={getStateColor} />

          {/* Sub-workflow grid */}
          {status.subWorkflows.length > 0 && (
            <>
              <h3 style={{ marginBottom: "0.5rem", marginTop: "1.5rem" }}>Sub-Workflows (invoked)</h3>
              <WorkflowGrid workflows={status.subWorkflows} getStateLabel={getStateLabel} getStateColor={getStateColor} />
            </>
          )}

          {polling && (
            <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Polling every 3s...{" "}
              <button
                onClick={() => setPolling(false)}
                style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
              >
                stop
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function WorkflowGrid({ workflows, getStateLabel, getStateColor }: {
  workflows: WorkflowStatus[];
  getStateLabel: (w: WorkflowStatus) => string;
  getStateColor: (label: string) => string;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: "8px",
    }}>
      {workflows.map((w, i) => {
        const label = getStateLabel(w);
        const color = getStateColor(label);
        return (
          <div
            key={w.runId}
            style={{
              padding: "8px",
              borderRadius: "6px",
              border: `2px solid ${color}`,
              background: `${color}15`,
              textAlign: "center",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ fontWeight: "bold" }}>#{i}</div>
            <div style={{ color, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginTop: "4px", wordBreak: "break-all" }}>
              {w.runId.slice(-8)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
