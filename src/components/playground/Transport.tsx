"use client";

/**
 * Global transport. The playhead position comes from the engine through the
 * UI store (display rate), never from a React timer.
 */
import { Play, Pause, Stop, SkipBack } from "@phosphor-icons/react";
import { Display, IconButton, Knob, Toggle } from "@/components/controls";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { formatPosition } from "@/lib/music/theory";
import { strings } from "@/i18n";
import { useState } from "react";

export function Transport() {
  const engineRef = useEngineRef();
  const tempo = useProjectStore((s) => s.project.tempo);
  const setTempo = useProjectStore((s) => s.setTempo);
  const swing = useProjectStore((s) => s.project.swing);
  const setSwing = useProjectStore((s) => s.setSwing);
  const loopRange = useProjectStore((s) => s.project.loopRange);
  const setLoopRange = useProjectStore((s) => s.setLoopRange);
  const beatsPerBar = useProjectStore((s) => s.project.timeSignature.beatsPerBar);

  const playing = useUiStore((s) => s.transportPlaying);
  const setPlaying = useUiStore((s) => s.setTransportPlaying);
  const position = useUiStore((s) => s.positionBeats);
  const audioStatus = useUiStore((s) => s.audioStatus);
  const [metronome, setMetronome] = useState(false);

  const disabled = audioStatus !== "running";

  const play = () => {
    engineRef.current?.startTransport();
    setPlaying(true);
  };
  const pause = () => {
    engineRef.current?.pauseTransport();
    setPlaying(false);
  };
  const stop = () => {
    engineRef.current?.stopTransport();
    setPlaying(false);
  };
  const toStart = () => {
    engineRef.current?.seek(0);
    useUiStore.getState().setPositionBeats(0);
  };

  return (
    <div className="flex items-center gap-3 border-b border-edge bg-surface px-3 py-2">
      <div className="flex items-center gap-1">
        <IconButton
          aria-label={strings.playground.transport.toStart}
          icon={<SkipBack size={15} weight="fill" />}
          onClick={toStart}
          disabled={disabled}
        />
        {playing ? (
          <IconButton
            aria-label={strings.playground.transport.pause}
            icon={<Pause size={15} weight="fill" />}
            onClick={pause}
            disabled={disabled}
          />
        ) : (
          <IconButton
            aria-label={strings.playground.transport.play}
            icon={<Play size={15} weight="fill" />}
            variant="primary"
            onClick={play}
            disabled={disabled}
          />
        )}
        <IconButton
          aria-label={strings.playground.transport.stop}
          icon={<Stop size={15} weight="fill" />}
          onClick={stop}
          disabled={disabled}
        />
      </div>

      <Display value={formatPosition(position, beatsPerBar)} size="md" />

      <label className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.transport.bpm}
        </span>
        <input
          type="number"
          min={30}
          max={300}
          value={Math.round(tempo)}
          aria-label={strings.playground.transport.bpm}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (!Number.isNaN(value)) {
              setTempo(value);
              engineRef.current?.setTempo(value);
            }
          }}
          className="material-sunken w-16 rounded-[var(--radius-control)] px-2 py-1 text-center font-mono text-sm text-ink outline-none"
        />
      </label>

      <Knob
        label={strings.playground.transport.swing}
        value={swing}
        min={0}
        max={1}
        defaultValue={0}
        size={36}
        onChange={(v) => {
          setSwing(v);
          engineRef.current?.setSwing(v);
        }}
      />

      <Toggle
        checked={metronome}
        onChange={(on) => {
          setMetronome(on);
          engineRef.current?.setMetronome(on);
        }}
        label={strings.playground.transport.metronome}
        led={metronome ? "on" : "off"}
      />

      <div className="flex items-center gap-2">
        <Toggle
          checked={loopRange.enabled}
          onChange={(on) => {
            const next = { ...loopRange, enabled: on };
            setLoopRange(next);
            engineRef.current?.setLoopRange(next);
          }}
          label={strings.playground.transport.loop}
          led={loopRange.enabled ? "on" : "off"}
        />
        <input
          type="number"
          min={0}
          step={1}
          value={loopRange.startBeat}
          aria-label={`${strings.playground.transport.loop} ${strings.playground.inspector.start}`}
          onChange={(e) => {
            const next = { ...loopRange, startBeat: Math.max(0, Number(e.target.value)) };
            setLoopRange(next);
            engineRef.current?.setLoopRange(next);
          }}
          className="material-sunken w-14 rounded-[var(--radius-control)] px-1 py-1 text-center font-mono text-xs text-ink outline-none"
        />
        <input
          type="number"
          min={1}
          step={1}
          value={loopRange.endBeat}
          aria-label={`${strings.playground.transport.loop} ${strings.playground.inspector.lengthBeats}`}
          onChange={(e) => {
            const next = { ...loopRange, endBeat: Math.max(1, Number(e.target.value)) };
            setLoopRange(next);
            engineRef.current?.setLoopRange(next);
          }}
          className="material-sunken w-14 rounded-[var(--radius-control)] px-1 py-1 text-center font-mono text-xs text-ink outline-none"
        />
      </div>
    </div>
  );
}
