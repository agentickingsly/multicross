# react-component

## Style conventions
- Inline styles using a const s = { ... } object at the bottom of each component
- No CSS modules, no Tailwind, no styled-components
- Colors: use hex values or hex + 2-char alpha for opacity (e.g. "#FF5733" + "88" = 53%)
- Dark header: background "#1e3a5f", color "white"
- Buttons: outline style for secondary, filled blue for primary actions

## Component structure
export default function MyComponent({ prop1, prop2 }: Props) {
  // 1. State declarations
  // 2. Derived values / useMemo
  // 3. Effects
  // 4. Handler functions
  // 5. Return JSX
}

// Types at top
interface Props { ... }

// Styles at bottom
const s = {
  container: { ... },
  button: { ... },
} satisfies Record;

## State patterns
- useState for local UI state
- No Redux, Zustand, or Context — lift state to page level if needed
- Loading: const [loading, setLoading] = useState(false)
- Error: const [error, setError] = useState("")
- Always clear error before a new attempt: setError("")

## API call pattern
async function handleAction() {
  setLoading(true);
  setError("");
  try {
    const data = await apiFunction();
    // handle success
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setLoading(false);
  }
}

## Auth pattern
// Get current user from localStorage
const currentUser = JSON.parse(localStorage.getItem("multicross_user") ?? "null");
const token = localStorage.getItem("multicross_token");

// Redirect if not logged in (in ProtectedRoute — don't duplicate)

## Navigation
import { useNavigate, useParams } from "react-router-dom";
const navigate = useNavigate();
navigate("/lobby");           // programmatic navigation
navigate(`/game/${gameId}`);  // with dynamic segment

## useMemo for expensive derivations
const participantColorMap = useMemo(() => {
  const map = new Map();
  participants.forEach(p => map.set(p.userId, p.color));
  return map;
}, [participants]);  // only recompute when participants changes

## Error display pattern
{error && (
  {error}
)}

## Loading pattern
{loading ? (
  Loading...
) : (
  // actual content
)}

## Existing routes
/ → LandingPage
/login → LoginPage
/register → RegisterPage
/lobby → LobbyPage (protected)
/game/:gameId → GamePage (protected)
/editor → EditorPage (protected)
/editor/:id → EditorPage edit mode (protected)
