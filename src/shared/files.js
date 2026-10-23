export const MAX_INPUT_FILE_SIZE = 100 * 1024 * 1024;

export const findOversizedFile = (files, limit = MAX_INPUT_FILE_SIZE) =>
  Array.from(files || []).find((file) => file?.size > limit);

export function formatBytes(value) {
  if (!value) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export const fileStem = (name = "arquivo") =>
  name.replace(/\.[^.]+$/, "") || "arquivo";

export function downloadFile(data, name, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
