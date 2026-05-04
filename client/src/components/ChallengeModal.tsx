import { useState, useEffect } from "react";
import type { Puzzle } from "@multicross/shared";
import { getPuzzles, challengeFriend } from "../api/client";

interface Props {
  friendUserId: string;
  friendName: string;
  onClose: () => void;
  onChallengeSent: (matchId: string) => void;
}

const TIME_PRESETS = [
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
] as const;

export default function ChallengeModal({ friendUserId, friendName, onClose, onChallengeSent }: Props) {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingPuzzles, setLoadingPuzzles] = useState(true);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [timePreset, setTimePreset] = useState<number>(600);
  const [customMinutes, setCustomMinutes] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPuzzles({ limit: 50, sort: "newest" })
      .then(({ puzzles: p }) => {
        setPuzzles(p.filter((x) => x.status === "published"));
      })
      .catch(() => setError("Failed to load puzzles"))
      .finally(() => setLoadingPuzzles(false));
  }, []);

  function effectiveSeconds(): number {
    if (useCustom) {
      const mins = parseInt(customMinutes, 10);
      if (!isNaN(mins) && mins >= 1 && mins <= 60) return mins * 60;
      return 600;
    }
    return timePreset;
  }

  async function handleSend() {
    if (!selectedPuzzleId) { setError("Please select a puzzle"); return; }
    const seconds = effectiveSeconds();
    setSending(true);
    setError("");
    try {
      const { matchId } = await challengeFriend(friendUserId, selectedPuzzleId, seconds);
      onChallengeSent(matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send challenge");
    } finally {
      setSending(false);
    }
  }

  const selectedPuzzle = puzzles.find((p) => p.id === selectedPuzzleId);

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <h2 style={s.title}>Challenge {friendName} to 1v1</h2>

        {error && <div style={s.error}>{error}</div>}

        <p style={s.label}>Select puzzle</p>
        {loadingPuzzles ? (
          <div style={s.loading}>Loading puzzles…</div>
        ) : (
          <div style={s.puzzleList}>
            {puzzles.map((puzzle) => (
              <button
                key={puzzle.id}
                style={puzzleItemStyle(selectedPuzzleId === puzzle.id)}
                onClick={() => setSelectedPuzzleId(puzzle.id)}
              >
                <span style={s.puzzleTitle}>{puzzle.title}</span>
                <span style={s.puzzleMeta}>
                  {puzzle.width}×{puzzle.height}
                  {puzzle.averageDifficulty != null &&
                    ` · ${puzzle.averageDifficulty.toFixed(1)} diff`}
                </span>
              </button>
            ))}
          </div>
        )}

        <p style={s.label}>Time limit</p>
        <div style={s.timeRow}>
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset.seconds}
              style={timeBtnStyle(!useCustom && timePreset === preset.seconds)}
              onClick={() => { setTimePreset(preset.seconds); setUseCustom(false); }}
            >
              {preset.label}
            </button>
          ))}
          <button
            style={timeBtnStyle(useCustom)}
            onClick={() => setUseCustom(true)}
          >
            Custom
          </button>
        </div>
        {useCustom && (
          <div style={s.customRow}>
            <input
              style={s.customInput}
              type="number"
              min={1}
              max={60}
              placeholder="Minutes (1–60)"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
            />
          </div>
        )}

        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            style={s.sendBtn}
            onClick={handleSend}
            disabled={sending || !selectedPuzzle}
          >
            {sending ? "Sending…" : "Send challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function puzzleItemStyle(selected: boolean): React.CSSProperties {
  return selected
    ? { ...s.puzzleItem, background: "#dbeafe", borderColor: "#2563eb" }
    : s.puzzleItem;
}

function timeBtnStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "#2563eb", color: "#fff", border: "1.5px solid #2563eb", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" }
    : { background: "transparent", color: "#2563eb", border: "1.5px solid #93c5fd", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" };
}

const s = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  modal: {
    background: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "480px",
    maxHeight: "85vh",
    overflowY: "auto" as const,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  title: {
    margin: "0 0 1rem",
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  label: {
    margin: "1rem 0 0.4rem",
    fontSize: "0.82rem",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  puzzleList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.4rem",
    maxHeight: "220px",
    overflowY: "auto" as const,
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    padding: "0.4rem",
  },
  puzzleItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    border: "1.5px solid #e2e8f0",
    borderRadius: "6px",
    background: "#f8fafc",
    cursor: "pointer",
    textAlign: "left" as const,
    gap: "0.5rem",
  } as React.CSSProperties,
  puzzleTitle: {
    fontWeight: "600",
    color: "#1e293b",
    fontSize: "0.875rem",
  },
  puzzleMeta: {
    fontSize: "0.75rem",
    color: "#64748b",
    flexShrink: 0,
  },
  timeRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  customRow: {
    marginTop: "0.5rem",
  },
  customInput: {
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "0.875rem",
    outline: "none",
    width: "160px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.5rem",
    marginTop: "1.5rem",
  },
  cancelBtn: {
    background: "transparent",
    color: "#64748b",
    border: "1.5px solid #cbd5e1",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
  },
  sendBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
  },
  loading: {
    color: "#64748b",
    fontSize: "0.875rem",
    padding: "0.5rem 0",
  },
  error: {
    color: "#dc2626",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
} satisfies Record<string, React.CSSProperties>;
