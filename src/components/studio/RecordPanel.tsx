"use client";

/**
 * Microphone recording.
 *
 * The permission prompt only fires after an explicit gesture. Input level is
 * read from the engine's input monitor (a real analyser, not an animation),
 * and a finished take is decoded and opened in the Sample Editor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Microphone, Record as RecordIcon, Stop, Pause, Play, Trash } from "@phosphor-icons/react";
import { Button, LedMeter } from "@/components/controls";
import { useEngineRef, useAnimationFrame } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { Panel } from "./Panel";
import { decodeUpload, saveSampleSound } from "./saveSampleSound";
import { strings } from "@/i18n";
import type { DecodedUpload } from "./saveSampleSound";

type Phase = "idle" | "armed" | "recording" | "paused" | "review";

/** First MediaRecorder mime type the browser actually supports. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function RecordPanel() {
  const engineRef = useEngineRef();
  const audioStatus = useUiStore((s) => s.audioStatus);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<DecodedUpload | null>(null);
  const [supported] = useState(() => pickMimeType() !== null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);

  const monitoring = phase === "armed" || phase === "recording" || phase === "paused";

  useAnimationFrame(monitoring, () => {
    const value = engineRef.current?.getInputLevel();
    if (value === null || value === undefined) return;
    setLevel(value);
    if (value > 0.98) setClip(true);
    if (phase === "recording") setElapsed((Date.now() - startedAt.current) / 1000);
  });

  const teardown = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    engineRef.current?.destroyInputMonitor();
  }, [engineRef]);

  useEffect(() => teardown, [teardown]);

  /* A device disappearing mid-session must surface, not fail silently. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onChange = async () => {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      if (deviceId && !inputs.some((d) => d.deviceId === deviceId)) {
        setError(strings.record.deviceLost);
        setPhase("idle");
        teardown();
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [deviceId, teardown]);

  const arm = async () => {
    setError(null);
    const engine = engineRef.current;
    if (!engine) return;
    if (!supported) {
      setError(strings.record.notSupported);
      return;
    }
    try {
      const stream = await engine.createInputMonitor(deviceId || undefined);
      streamRef.current = stream;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
      setPhase("armed");
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setError(strings.record.permissionDenied);
      else if (name === "NotFoundError" || name === "OverconstrainedError") setError(strings.record.noDevice);
      else setError(strings.record.notSupported);
      setPhase("idle");
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) {
      setError(strings.record.notSupported);
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const engine = engineRef.current;
      if (!engine || blob.size === 0) {
        setPhase("armed");
        return;
      }
      try {
        const decoded = await decodeUpload(engine, blob, `recording-${new Date().toISOString().slice(0, 19)}`);
        setTake(decoded);
        setPhase("review");
      } catch {
        setError(strings.import.decodeFailed);
        setPhase("armed");
      }
    };
    recorder.start(200);
    recorderRef.current = recorder;
    startedAt.current = Date.now();
    setElapsed(0);
    setClip(false);
    setPhase("recording");
  };

  const canPause = typeof MediaRecorder !== "undefined" && "pause" in MediaRecorder.prototype;

  const previewTake = () => {
    const engine = engineRef.current;
    if (!engine || !take) return;
    const source = engine.context?.createBufferSource();
    if (!source || !engine.context) return;
    source.buffer = take.buffer;
    source.connect(engine.context.destination);
    source.start();
  };

  const saveTake = async () => {
    if (!take) return;
    const sound = await saveSampleSound(take, "recording", take.filename);
    setTake(null);
    setPhase("armed");
    setEditingSoundId(sound.id);
    setStudioMode("sample");
  };

  /* Recording is a temporary state, not a place: leaving it goes back to
     whichever sound is open. */
  const close = () => {
    teardown();
    const current = useProjectStore
      .getState()
      .project.sounds.find((s) => s.id === useUiStore.getState().editingSoundId);
    setStudioMode(current?.type === "sample" ? "sample" : "synth");
  };

  return (
    <div className="p-3">
      <Panel
        title={strings.record.title}
        hint={strings.studio.modeHints.record}
        actions={
          <Button size="sm" variant="ghost" onClick={close}>
            {strings.common.close}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          {!supported && <p className="text-sm text-error">{strings.record.notSupported}</p>}
          {error && (
            <p role="alert" className="material-sunken rounded-[var(--radius-control)] p-3 text-sm text-error">
              {error}
            </p>
          )}

          {phase === "idle" ? (
            <Button
              variant="primary"
              icon={<Microphone size={16} weight="bold" />}
              disabled={!supported || audioStatus !== "running"}
              onClick={() => void arm()}
            >
              {strings.record.requestMic}
            </Button>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                {strings.record.device}
                <select
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    teardown();
                    setPhase("idle");
                  }}
                  className="material-sunken rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink"
                >
                  <option value="">Default</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || device.deviceId.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-3">
                <span className="w-28 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  {strings.record.inputLevel}
                </span>
                <LedMeter level={level} clip={clip} label={strings.record.inputLevel} />
                {clip && <span className="font-mono text-xs text-error">{strings.record.clipping}</span>}
              </div>

              <div className="flex items-center gap-2">
                {phase !== "recording" && phase !== "paused" && (
                  <Button variant="danger" icon={<RecordIcon size={15} weight="fill" />} onClick={startRecording}>
                    {strings.record.start}
                  </Button>
                )}
                {phase === "recording" && (
                  <>
                    {canPause && (
                      <Button
                        icon={<Pause size={15} weight="fill" />}
                        onClick={() => {
                          recorderRef.current?.pause();
                          setPhase("paused");
                        }}
                      >
                        {strings.record.pause}
                      </Button>
                    )}
                    <Button icon={<Stop size={15} weight="fill" />} onClick={() => recorderRef.current?.stop()}>
                      {strings.record.stop}
                    </Button>
                  </>
                )}
                {phase === "paused" && (
                  <>
                    <Button
                      icon={<RecordIcon size={15} weight="fill" />}
                      onClick={() => {
                        recorderRef.current?.resume();
                        setPhase("recording");
                      }}
                    >
                      {strings.record.resume}
                    </Button>
                    <Button icon={<Stop size={15} weight="fill" />} onClick={() => recorderRef.current?.stop()}>
                      {strings.record.stop}
                    </Button>
                  </>
                )}
                {(phase === "recording" || phase === "paused") && (
                  <span className="font-mono text-sm text-ink">{elapsed.toFixed(1)}s</span>
                )}
              </div>

              {phase === "review" && take && (
                <div className="material-sunken flex items-center gap-2 rounded-[var(--radius-control)] p-3">
                  <span className="font-mono text-xs text-ink-soft">
                    {take.buffer.duration.toFixed(2)}s · {take.buffer.sampleRate} Hz
                  </span>
                  <Button size="sm" icon={<Play size={14} weight="fill" />} onClick={previewTake}>
                    {strings.record.preview}
                  </Button>
                  <Button
                    size="sm"
                    icon={<Trash size={14} />}
                    onClick={() => {
                      setTake(null);
                      setPhase("armed");
                    }}
                  >
                    {strings.record.discard}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void saveTake()}>
                    {strings.record.save}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
