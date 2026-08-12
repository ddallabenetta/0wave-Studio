/**
 * Project export/import as a single portable JSON file, plus a helper to
 * duplicate a project inside the local repository.
 *
 * Export envelope (downloaded as `<name>.0wave.json`):
 *   {
 *     format: "0wave-project", formatVersion: 1, exportedAt,
 *     project: <validated Project>,
 *     blobs: [{ key, mimeType, base64 }]
 *   }
 * Blobs travel as base64 so the file is trivially portable.
 */
import { createId } from "../schema/factories";
import { parseProject, toProjectExport } from "../schema/migrations";
import type { ID, Project } from "../schema/types";
import { localRepository } from "./local";

const EXPORT_FORMAT = "0wave-project" as const;
const EXPORT_FORMAT_VERSION = 1 as const;

interface ExportedBlob {
  key: string;
  mimeType: string;
  base64: string;
}

interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  project: Project;
  blobs: ExportedBlob[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("The project file contains invalid base64 data");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 80);
  return clean || "project";
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Serialize a project plus its referenced blobs and trigger a download. */
export async function exportProject(project: Project): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Export requires a browser environment");
  }
  const exported = toProjectExport(project);
  const blobs: ExportedBlob[] = [];
  const seen = new Set<string>();
  for (const key of exported.blobKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const blob = await localRepository.loadBlob(key);
    if (!blob) continue; // Asset metadata survives the round-trip; blob is simply absent.
    blobs.push({
      key,
      mimeType: blob.type || "application/octet-stream",
      base64: await blobToBase64(blob),
    });
  }
  const envelope: ExportEnvelope = {
    format: exported.format,
    formatVersion: exported.formatVersion,
    exportedAt: exported.exportedAt,
    project: exported.project,
    blobs,
  };
  downloadJson(`${sanitizeFilename(project.name)}.0wave.json`, envelope);
}

/**
 * Parse a `.0wave.json` file, restore its blobs and project into the local
 * repository, and return the validated Project. The caller decides whether
 * to loadProject() it into the store.
 */
export async function importProject(file: File): Promise<Project> {
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("Not a valid project file: could not parse JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Not a valid project file: expected a JSON object");
  }
  const envelope = payload as Partial<ExportEnvelope>;
  if (envelope.format !== EXPORT_FORMAT) {
    throw new Error(`Not a 0wave project file (expected format "${EXPORT_FORMAT}")`);
  }
  if (envelope.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported project file version: ${String(envelope.formatVersion)}`);
  }
  const project = parseProject(envelope.project);
  if (!project) {
    throw new Error("The project in this file could not be validated");
  }
  if (!Array.isArray(envelope.blobs)) {
    throw new Error("The project file is missing its blobs section");
  }
  for (const entry of envelope.blobs) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.key !== "string" ||
      typeof entry.mimeType !== "string" ||
      typeof entry.base64 !== "string"
    ) {
      throw new Error("The project file contains an invalid blob entry");
    }
    const bytes = base64ToBytes(entry.base64);
    await localRepository.saveBlob({
      key: entry.key,
      data: new Blob([bytes], { type: entry.mimeType }),
      mimeType: entry.mimeType,
    });
  }
  await localRepository.saveProject(project);
  return project;
}

/**
 * Clone a persisted project under a fresh id (new name, dates; assets keep
 * their blob keys, so the copy shares the original's blobs). Returns null
 * when the source id does not exist or cannot be validated.
 */
export async function duplicateProjectInRepository(id: ID): Promise<Project | null> {
  const raw = await localRepository.loadProject(id);
  if (!raw) return null;
  const source = parseProject(raw);
  if (!source) return null;
  const copy: Project = {
    ...structuredClone(source),
    id: createId(),
    name: `${source.name} Copy`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await localRepository.saveProject(copy);
  return copy;
}
