/**
 * Hands a generated file to the browser. The artifact demo swaps this module for one that goes
 * through the host's download prompt (see src/demo/download-demo.ts).
 */
export type SaveResult = "saved" | "declined" | "unavailable";

export function canSave(_filename: string): boolean {
  return true;
}

const TYPES: Record<string, string> = { csv: "text/csv;charset=utf-8", ics: "text/calendar;charset=utf-8", html: "text/html;charset=utf-8", pdf: "application/pdf" };

export async function saveFile(filename: string, data: string | Uint8Array): Promise<SaveResult> {
  const type = TYPES[filename.split(".").pop() ?? ""] ?? "text/plain;charset=utf-8";
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
