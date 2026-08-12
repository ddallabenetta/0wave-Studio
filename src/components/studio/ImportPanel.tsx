"use client";

/**
 * Audio import: drag and drop or file picker, validated and decoded by the
 * browser. The original file is preserved as the asset blob.
 */
import { useRef, useState } from "react";
import { UploadSimple, Play } from "@phosphor-icons/react";
import { Button } from "@/components/controls";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useUiStore } from "@/lib/state/ui-store";
import { Panel } from "./Panel";
import { decodeUpload, saveSampleSound } from "./saveSampleSound";
import { strings } from "@/i18n";
import type { DecodedUpload } from "./saveSampleSound";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SECONDS = 600;

export function ImportPanel() {
  const engineRef = useEngineRef();
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DecodedUpload | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setPending(null);
    const engine = engineRef.current;
    if (!engine) return;

    if (file.size > MAX_BYTES) {
      setError(strings.import.tooLarge.replace("{max}", String(Math.round(MAX_BYTES / 1024 / 1024))));
      return;
    }
    if (file.type && !file.type.startsWith("audio/")) {
      setError(strings.import.unsupportedType);
      return;
    }

    setBusy(true);
    try {
      const decoded = await decodeUpload(engine, file, file.name);
      if (decoded.buffer.duration > MAX_SECONDS) {
        setError(strings.import.tooLong.replace("{max}", String(MAX_SECONDS)));
        return;
      }
      setPending(decoded);
    } catch {
      setError(strings.import.decodeFailed);
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    const engine = engineRef.current;
    if (!engine?.context || !pending) return;
    const source = engine.context.createBufferSource();
    source.buffer = pending.buffer;
    source.connect(engine.context.destination);
    source.start();
  };

  const save = async () => {
    if (!pending) return;
    const sound = await saveSampleSound(pending, "import", pending.filename.replace(/\.[^.]+$/, ""));
    setPending(null);
    setEditingSoundId(sound.id);
    setStudioMode("sample");
  };

  return (
    <div className="p-3">
      <Panel title={strings.import.title}>
        <div className="flex flex-col gap-4 p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`material-sunken flex flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed p-10 text-center ${
              dragging ? "border-accent bg-accent-wash" : "border-edge"
            }`}
          >
            <UploadSimple size={28} weight="bold" aria-hidden className="text-ink-faint" />
            <p className="text-sm text-ink-soft">{strings.import.drop}</p>
            <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
              {strings.import.browse}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="sr-only"
              aria-label={strings.import.browse}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {error && (
            <p role="alert" className="material-sunken rounded-[var(--radius-control)] p-3 text-sm text-error">
              {error}
            </p>
          )}

          {pending && (
            <div className="material-sunken flex items-center gap-3 rounded-[var(--radius-control)] p-3">
              <span className="truncate font-mono text-xs text-ink-soft">
                {pending.filename} · {pending.buffer.duration.toFixed(2)}s · {pending.buffer.sampleRate} Hz ·{" "}
                {pending.buffer.numberOfChannels}ch
              </span>
              <Button size="sm" icon={<Play size={14} weight="fill" />} onClick={preview}>
                {strings.import.preview}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void save()}>
                {strings.import.save}
              </Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
