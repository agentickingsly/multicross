import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../api/client";

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f1f5f9",
  },
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "2.5rem",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: "700",
    color: "#1e3a5f",
    margin: 0,
    fontFamily: "Georgia, serif",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    fontSize: "0.875rem",
    color: "#475569",
    fontWeight: "500",
  },
  input: {
    padding: "0.6rem 0.75rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "1rem",
    outline: "none",
  },
  btn: {
    padding: "0.75rem",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  error: {
    color: "#dc2626",
    fontSize: "0.875rem",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    padding: "0.5rem 0.75rem",
  },
  footer: {
    textAlign: "center",
    fontSize: "0.875rem",
    color: "#64748b",
  },
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !displayName || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { user, token } = await register(email, displayName, password, inviteCode);
      localStorage.setItem("multicross_token", token);
      localStorage.setItem("multicross_user", JSON.stringify(user));
      navigate("/lobby");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "Failed to fetch" || msg.toLowerCase().includes("connect")) {
        setError("Could not connect to server — is it running?");
      } else if (msg.toLowerCase().includes("invite")) {
        setError("Invalid invite code — please check with the app owner");
      } else if (msg.toLowerCase().includes("email") || msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("duplicate")) {
        setError("An account with this email already exists");
      } else {
        setError(msg || "Registration failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={handleSubmit}>
        <h1 style={s.title}>Multicross</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Create your account</p>

        {error && <div style={s.error}>{error}</div>}

        <label style={s.label}>
          Display name
          <input
            style={s.input}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="CrosswordKing"
            autoFocus
          />
        </label>

        <label style={s.label}>
          Email
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label style={s.label}>
          Password
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min. 8 characters"
          />
        </label>

        <label style={s.label}>
          Invite code
          <input
            style={s.input}
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter your invite code"
          />
        </label>

        <button style={s.btn} type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>

        <div style={s.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
