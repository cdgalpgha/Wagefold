/**
 * Downloads inside the artifact go through the host's `downloads` capability: the viewer sees the
 * file name and size and confirms. Outside a host (opening the built file directly) it falls back
 * to a normal browser download.
 */
import { saveFile as browserSave, type SaveResult } from "../lib/download";

export type { SaveResult };

type Downloads = { save(req: { filename: string; data: string }): Promise<{ status: string }> };
type Host = { use(name: "downloads"): Promise<Downloads | null> };

const ALLOWED = ["csv", "html", "txt", "json"];

const host = () => (typeof window !== "undefined" ? (window as unknown as { claude?: Host }).claude : undefined);

export function canSave(filename: string): boolean {
  if (!host()) return true;
  return ALLOWED.includes(filename.split(".").pop() ?? "");
}

export async function saveFile(filename: string, data: string): Promise<SaveResult> {
  const claude = host();
  if (!claude) return browserSave(filename, data);
  const downloads = await claude.use("downloads").catch(() => null);
  if (!downloads) return "unavailable";
  try {
    await downloads.save({ filename, data });
    return "saved";
  } catch (err) {
    return (err as { code?: string }).code === "declined" ? "declined" : "unavailable";
  }
}
