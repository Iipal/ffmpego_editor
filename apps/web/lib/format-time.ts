export function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;

  return `${String(minutes).padStart(2, "0")}:${remainingSeconds
    .toFixed(2)
    .padStart(5, "0")}`;
}
