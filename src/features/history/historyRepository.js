const HISTORY_KEY = "pl-studio-history";
const LEGACY_HISTORY_KEY = "pdfly-history";
const MAX_HISTORY_ITEMS = 20;

export function loadHistory() {
  try {
    const stored =
      localStorage.getItem(HISTORY_KEY) ||
      localStorage.getItem(LEGACY_HISTORY_KEY) ||
      "[]";
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(current, tool, files, size) {
  const entry = {
    id: Date.now(),
    tool: tool.title,
    file: files.map((file) => file.name).join(", "),
    date: new Date().toLocaleString("pt-BR"),
    size,
  };
  const next = [entry, ...current].slice(0, MAX_HISTORY_ITEMS);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
}
