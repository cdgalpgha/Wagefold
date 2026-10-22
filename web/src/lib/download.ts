/**
 * Hands a generated file to the browser. The artifact demo swaps this module for one that goes
 * through the host's download prompt (see src/demo/download-demo.ts).
 */
export type SaveResult = "saved" | "declined" | "unavailable";

export function canSave(_filename: string): boolean {
  return true;
}

export async function saveFile(filename: string, data: string): Promise<SaveResult> {
  const type = filename.endsWith(".csv") ? "text/csv" : filename.endsWith(".ics") ? "text/calendar" : filename.endsWith(".html") ? "text/html" : "text/plain";
  const url = URL.createObjectURL(new Blob([data], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
