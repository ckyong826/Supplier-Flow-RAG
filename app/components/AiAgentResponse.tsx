"use client";

import { memo, useEffect, useId, useState } from "react";

export type AgentStepKind = "understand" | "search" | "source" | "rfq" | "track";

export type AgentStep = {
  label: string;
  detail: string;
  kind: AgentStepKind;
};

type AgentWorkflowProps = {
  steps: AgentStep[];
  isWorking?: boolean;
  durationMs?: number;
};

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.max(100, Math.round(durationMs))}ms`;
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

export const AgentWorkflow = memo(function AgentWorkflow({
  steps,
  isWorking = false,
  durationMs = 0,
}: AgentWorkflowProps) {
  const [open, setOpen] = useState(isWorking);
  const [activeIndex, setActiveIndex] = useState(isWorking ? 0 : steps.length);
  const [reducedMotion, setReducedMotion] = useState(false);
  const traceId = useId().replace(/:/g, "");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isWorking || !steps.length) {
      setActiveIndex(isWorking ? Math.max(steps.length - 1, 0) : steps.length);
      return;
    }
    if (reducedMotion) {
      setActiveIndex(steps.length - 1);
      return;
    }

    setActiveIndex(0);
    const timer = window.setInterval(() => {
      setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
    }, 720);
    return () => window.clearInterval(timer);
  }, [isWorking, reducedMotion, steps.length]);

  useEffect(() => {
    setOpen(isWorking);
  }, [isWorking]);

  const visibleSteps = isWorking ? steps.slice(0, activeIndex + 1) : steps;
  const label = isWorking
    ? "Working..."
    : `Worked for ${formatDuration(durationMs)}`;

  return (
    <div className="agent-workflow" data-working={isWorking || undefined}>
      <button
        type="button"
        className="agent-workflow-trigger"
        aria-expanded={open}
        aria-controls={traceId}
        onClick={() => setOpen((current) => !current)}
      >
        {isWorking ? (
          <span className="agent-pixel-loader" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
          </span>
        ) : (
          <span className="agent-complete-mark" aria-hidden="true">✓</span>
        )}
        <span>{label}</span>
        <span className={`agent-workflow-chevron ${open ? "open" : ""}`} aria-hidden="true" />
      </button>

      <div id={traceId} className={`agent-workflow-trace ${open ? "open" : ""}`}>
        <div className="agent-workflow-trace-inner">
          {isWorking && <div className="agent-thinking-label">Thinking...</div>}
          {visibleSteps.map((step, index) => {
            const active = isWorking && index === activeIndex;
            const complete = !isWorking || index < activeIndex;
            return (
              <div className={`agent-step ${active ? "active" : ""}`} key={`${step.kind}-${step.label}`}>
                <span className={`agent-step-icon ${complete ? "complete" : ""}`} aria-hidden="true">
                  {active ? <i className="agent-step-spinner" /> : complete ? "✓" : null}
                </span>
                <span className="agent-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

AgentWorkflow.displayName = "AgentWorkflow";
