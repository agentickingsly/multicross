import { useNavigate } from "react-router-dom";

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    color: "#fff",
    fontFamily: "Georgia, serif",
    gap: "2rem",
    padding: "2rem",
  },
  logo: {
    fontSize: "3.5rem",
    fontWeight: "bold",
    letterSpacing: "0.05em",
    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  tagline: {
    fontSize: "1.25rem",
    opacity: 0.85,
    textAlign: "center",
    maxWidth: "420px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,2.5rem)",
    gap: "3px",
    marginBlock: "1rem",
  },
  cell: {
    width: "2.5rem",
    height: "2.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "1rem",
    borderRadius: "4px",
  },
  buttons: {
    display: "flex",
    gap: "1rem",
  },
  btn: {
    padding: "0.75rem 2rem",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "600",
    transition: "opacity 0.15s",
  },
  btnPrimary: {
    background: "#fff",
    color: "#1e3a5f",
  },
  btnSecondary: {
    background: "transparent",
    color: "#fff",
    border: "2px solid rgba(255,255,255,0.6)",
  },
};

const DEMO_GRID = [
  ["M", "U", "L", "T", "I"],
  ["U", null, "O", null, "S"],
  ["S", "O", "L", "V", "E"],
  ["I", null, "G", null, null],
  ["C", "R", "O", "S", "S"],
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.logo}>Multicross</div>
      <div style={styles.tagline}>
        Solve crosswords together. Real-time, multiplayer, fun.
      </div>

      {/* decorative mini grid */}
      <div style={styles.grid}>
        {DEMO_GRID.flatMap((row, r) =>
          row.map((letter, c) => (
            <div
              key={`${r}-${c}`}
              style={{
                ...styles.cell,
                background: letter === null ? "#1a1a1a" : "rgba(255,255,255,0.15)",
                color: "#fff",
              }}
            >
              {letter}
            </div>
          ))
        )}
      </div>

      <div style={styles.buttons}>
        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={() => navigate("/login")}
        >
          Log in
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnSecondary }}
          onClick={() => navigate("/register")}
        >
          Register
        </button>
      </div>
    </div>
  );
}
