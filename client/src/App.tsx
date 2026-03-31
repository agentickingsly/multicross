import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div>Home — TODO (Session 4)</div>} />
      <Route path="/game/:roomCode" element={<div>Game — TODO (Session 4)</div>} />
    </Routes>
  );
}
