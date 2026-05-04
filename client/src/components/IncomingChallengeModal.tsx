import type { MatchInvitePayload } from "@multicross/shared";
import { ws } from "../ws/socket";

interface Props {
  payload: MatchInvitePayload;
  onAccept: () => void;
  onDecline: () => void;
}

function formatTimeLimit(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins} min`;
  return `${mins}m ${secs}s`;
}

export default function IncomingChallengeModal({ payload, onAccept, onDecline }: Props) {
  const { matchId, challengerName, puzzleTitle, timeLimitSeconds } = payload;

  function handleAccept() {
    ws.emit("match_accept", { matchId });
    onAccept();
  }

  function handleDecline() {
    ws.emit("match_decline", { matchId });
    onDecline();
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.icon}>⚔️</div>
        <h2 style={s.title}>Challenge received!</h2>
        <p style={s.challenger}>
          <strong>{challengerName}</strong> has challenged you to a 1v1
        </p>
        <div style={s.detail}>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Puzzle</span>
            <span style={s.detailValue}>{puzzleTitle}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Time limit</span>
            <span style={s.detailValue}>{formatTimeLimit(timeLimitSeconds)}</span>
          </div>
        </div>
        <div style={s.actions}>
          <button style={s.declineBtn} onClick={handleDecline}>
            Decline
          </button>
          <button style={s.acceptBtn} onClick={handleAccept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    padding: "1rem",
  },
  modal: {
    background: "#fff",
    borderRadius: "12px",
    padding: "2rem 1.75rem",
    width: "100%",
    maxWidth: "380px",
    textAlign: "center" as const,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  icon: {
    fontSize: "2.5rem",
    marginBottom: "0.5rem",
  },
  title: {
    margin: "0 0 0.35rem",
    fontSize: "1.2rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  challenger: {
    margin: "0 0 1.25rem",
    fontSize: "0.95rem",
    color: "#475569",
  },
  detail: {
    background: "#f8fafc",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    padding: "0.75rem 1rem",
    marginBottom: "1.5rem",
    textAlign: "left" as const,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.25rem 0",
  },
  detailLabel: {
    fontSize: "0.8rem",
    color: "#64748b",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  detailValue: {
    fontSize: "0.9rem",
    color: "#1e293b",
    fontWeight: "600",
  },
  actions: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "center",
  },
  declineBtn: {
    background: "transparent",
    color: "#64748b",
    border: "1.5px solid #cbd5e1",
    borderRadius: "6px",
    padding: "0.6rem 1.25rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9rem",
  },
  acceptBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 1.25rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9rem",
  },
} satisfies Record<string, React.CSSProperties>;
