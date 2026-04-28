interface Props {
  playing: boolean;
  speed: 1 | 2 | 4;
  currentStep: number;
  totalSteps: number;
  hasFull: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSetSpeed: (s: 1 | 2 | 4) => void;
  onReset: () => void;
}

const SPEEDS: (1 | 2 | 4)[] = [1, 2, 4];

export default function ReplayControls({
  playing,
  speed,
  currentStep,
  totalSteps,
  hasFull,
  onPlay,
  onPause,
  onSetSpeed,
  onReset,
}: Props) {
  if (!hasFull) {
    return (
      <div style={s.container}>
        <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
          No move history — this game was completed before history recording was enabled.
        </span>
      </div>
    );
  }

  const atEnd = currentStep >= totalSteps;

  return (
    <div style={s.container}>
      <button
        style={s.primaryBtn}
        onClick={playing ? onPause : onPlay}
        title={playing ? "Pause" : atEnd ? "Replay from start" : "Play"}
      >
        {playing ? "⏸ Pause" : atEnd ? "↺ Replay" : "▶ Play"}
      </button>

      <button style={s.secondaryBtn} onClick={onReset} title="Reset to beginning">
        ↩ Reset
      </button>

      <div style={s.speedGroup}>
        {SPEEDS.map((s_) => (
          <button
            key={s_}
            style={speed === s_ ? s.speedBtnActive : s.speedBtn}
            onClick={() => onSetSpeed(s_)}
          >
            {s_}×
          </button>
        ))}
      </div>

      <span style={s.counter}>
        {currentStep} / {totalSteps}
      </span>
    </div>
  );
}

const s = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginTop: "1rem",
    padding: "0.75rem 1rem",
    background: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    flexWrap: "wrap" as const,
  },
  primaryBtn: {
    padding: "0.4rem 1rem",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "0.4rem 0.75rem",
    background: "none",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  speedGroup: {
    display: "flex",
    gap: "2px",
  },
  speedBtn: {
    padding: "0.3rem 0.6rem",
    background: "none",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  speedBtnActive: {
    padding: "0.3rem 0.6rem",
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "1px solid #93c5fd",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: "700",
    cursor: "pointer",
  },
  counter: {
    fontSize: "0.8rem",
    color: "#94a3b8",
    marginLeft: "auto",
    fontVariantNumeric: "tabular-nums",
  },
} satisfies Record<string, React.CSSProperties>;
