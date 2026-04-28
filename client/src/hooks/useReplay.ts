import { useState, useEffect, useMemo } from "react";
import type { GameMove, GameCell } from "@multicross/shared";

const SPEED_DELAYS: Record<number, number> = { 1: 300, 2: 150, 4: 75 };

interface UseReplayReturn {
  replayCells: GameCell[];
  currentStep: number;
  totalSteps: number;
  playing: boolean;
  speed: 1 | 2 | 4;
  play: () => void;
  pause: () => void;
  setSpeed: (s: 1 | 2 | 4) => void;
  reset: () => void;
}

export function useReplay(moves: GameMove[], gameId: string): UseReplayReturn {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  // Build cell state from moves up to currentStep
  const replayCells = useMemo((): GameCell[] => {
    const cellMap = new Map<string, GameCell>();
    for (let i = 0; i < currentStep; i++) {
      const move = moves[i];
      const key = `${move.row},${move.col}`;
      if (move.value === "") {
        cellMap.delete(key);
      } else {
        cellMap.set(key, {
          id: move.id,
          gameId,
          row: move.row,
          col: move.col,
          value: move.value,
          filledBy: move.userId,
          filledAt: move.createdAt,
        });
      }
    }
    return Array.from(cellMap.values());
  }, [moves, currentStep, gameId]);

  // Advance step on interval when playing
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= moves.length) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, SPEED_DELAYS[speed]);
    return () => clearInterval(id);
  }, [playing, speed, moves.length]);

  // Auto-stop at the end
  useEffect(() => {
    if (playing && currentStep >= moves.length) {
      setPlaying(false);
    }
  }, [currentStep, moves.length, playing]);

  function play() {
    if (currentStep >= moves.length) {
      setCurrentStep(0);
    }
    setPlaying(true);
  }

  function pause() {
    setPlaying(false);
  }

  function reset() {
    setPlaying(false);
    setCurrentStep(0);
  }

  return {
    replayCells,
    currentStep,
    totalSteps: moves.length,
    playing,
    speed,
    play,
    pause,
    setSpeed,
    reset,
  };
}
