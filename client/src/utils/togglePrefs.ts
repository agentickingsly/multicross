const KEY = "multicross_toggle_prefs";

interface TogglePrefs {
  showColors: boolean;
  lockCorrect: boolean;
  lockWord: boolean;
  skipFilled: boolean;
}

const DEFAULTS: TogglePrefs = {
  showColors: true,
  lockCorrect: false,
  lockWord: false,
  skipFilled: false,
};

export function getTogglePrefs(): TogglePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TogglePrefs>;
    return {
      showColors: parsed.showColors ?? DEFAULTS.showColors,
      lockCorrect: parsed.lockCorrect ?? DEFAULTS.lockCorrect,
      lockWord: parsed.lockWord ?? DEFAULTS.lockWord,
      skipFilled: parsed.skipFilled ?? DEFAULTS.skipFilled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setTogglePrefs(prefs: TogglePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable (private browsing quota exceeded etc.) — ignore
  }
}
