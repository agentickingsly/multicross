import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type {
  MatchInvitePayload,
  MatchStartedPayload,
  MatchCancelledPayload,
} from "@multicross/shared";
import { ws } from "../ws/socket";
import IncomingChallengeModal from "./IncomingChallengeModal";

export default function GlobalNotifications() {
  const navigate = useNavigate();
  const [incomingChallenge, setIncomingChallenge] = useState<MatchInvitePayload | null>(null);
  const [declineToast, setDeclineToast] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("multicross_token") ?? "";
    ws.connect(token);

    const offMatchInvite = ws.on("match_invite", (payload: MatchInvitePayload) => {
      setIncomingChallenge(payload);
    });

    const offMatchStarted = ws.on("match_started", (payload: MatchStartedPayload) => {
      navigate(`/competitive/${payload.matchId}`);
    });

    const offMatchCancelled = ws.on("match_cancelled", (payload: MatchCancelledPayload) => {
      setDeclineToast(`${payload.opponentName} declined your challenge`);
      setTimeout(() => setDeclineToast(null), 5000);
    });

    return () => {
      offMatchInvite();
      offMatchStarted();
      offMatchCancelled();
    };
  }, [navigate]);

  return (
    <>
      {incomingChallenge && (
        <IncomingChallengeModal
          payload={incomingChallenge}
          onAccept={() => setIncomingChallenge(null)}
          onDecline={() => setIncomingChallenge(null)}
        />
      )}
      {declineToast && (
        <div style={s.toast} onClick={() => setDeclineToast(null)}>
          {declineToast}
        </div>
      )}
    </>
  );
}

const s = {
  toast: {
    position: "fixed" as const,
    bottom: "1.5rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e293b",
    color: "#fff",
    padding: "0.65rem 1.25rem",
    borderRadius: "8px",
    fontSize: "0.9rem",
    fontWeight: "500",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    cursor: "pointer",
    zIndex: 2000,
    whiteSpace: "nowrap" as const,
  },
} satisfies Record<string, React.CSSProperties>;
