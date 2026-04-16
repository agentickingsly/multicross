import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PuzzleEditor, { type EditablePuzzle } from "../components/PuzzleEditor";
import { createPuzzle } from "../api/client";

const DEFAULT_SIZE = 15;

function makeEmptyGrid(w: number, h: number): (string | null)[][] {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(""));
}

export default function EditorPage() {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem("multicross_user");
  const user = storedUser ? (JSON.parse(storedUser) as { displayName?: string }) : {};

  const [isSaving, setIsSaving] = useState(false);
  const [puzzle, setPuzzle] = useState<EditablePuzzle>({
    title: "",
    author: user.displayName ?? "",
    width: DEFAULT_SIZE,
    height: DEFAULT_SIZE,
    grid: makeEmptyGrid(DEFAULT_SIZE, DEFAULT_SIZE),
    clues: { across: {}, down: {} },
    status: "draft",
  });

  async function handleSave(p: EditablePuzzle, status: "draft" | "published") {
    if (!p.title.trim()) {
      alert("Please enter a puzzle title before saving.");
      return;
    }
    setIsSaving(true);
    try {
      await createPuzzle({ ...p, status });
      navigate("/lobby");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PuzzleEditor
      puzzle={puzzle}
      onChange={setPuzzle}
      onSave={handleSave}
      onCancel={() => navigate("/lobby")}
      isSaving={isSaving}
    />
  );
}
