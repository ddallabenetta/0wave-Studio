"use client";

/**
 * Global transport. The playhead position comes from the engine through the
 * UI store (display rate), never from a React timer.
 *
 * The bar is read left to right in the order the controls are reached for:
 * move the playhead, read where you are, set the pulse, then the two things
 * that repeat (click and loop). Each group is separated by a hairline rather
 * than by spacing alone, so the row scans as four things instead of nine.
 *
 * The loop is expressed the way a musician says it — "from bar 2, four bars"
 * — while the project keeps storing beats.
 */
import { Play, Pause, Stop, SkipBack } from "@phosphor-icons/react";
import { Display, IconButton, Knob, Toggle } from "@/components/controls";
import { HelpTip } from "@/components/guide/HelpTip";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { formatPosition } from "@/lib/music/theory";
import { strings } from "@/i18n";
import { useState } from "react";
import { useTransportControls } from "./useTransportControls";

function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-edge" />;
}

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
  const position = useUiStore((s) => s.positionBeats);
  const [metronome, setMetronome] = useState(false);

  const { play, pause, stop, toStart, ready } = useTransportControls();
  const disabled = !ready;

  /* Loop bounds are stored in beats and shown in bars: "from bar 2, 4 bars". */
  const loopStartBar = Math.max(1, Math.round(loopRange.startBeat / beatsPerBar) + 1);
  const loopLengthBars = Math.max(
    1,
    Math.round((loopRange.endBeat - loopRange.startBeat) / beatsPerBar),
  );
  const applyLoop = (startBar: number, lengthBars: number) => {
    const startBeat = Math.max(0, (Math.max(1, startBar) - 1) * beatsPerBar);
    const next = {
      ...loopRange,
      startBeat,
      endBeat: startBeat + Math.max(1, lengthBars) * beatsPerBar,
    };
    setLoopRange(next);
    engineRef.current?.setLoopRange(next);
  };

  const numberFieldClass =
    "material-sunken motion-ui w-12 rounded-[var(--radius-control)] px-1 py-1 text-center font-mono text-xs text-ink outline-none focus:shadow-[var(--halo)]";

  return (
    <div className="relative flex items-center gap-3 overflow-x-auto border-b border-edge bg-surface px-3 py-2">
      {/* A thread of accent light along the bar while the transport runs:
          the one piece of chrome that has to be readable from across the
          room. Driven by real transport state, not a timer. */}
      <span
        aria-hidden
        className="motion-ui pointer-events-none absolute inset-x-0 bottom-0 h-px bg-accent"
        style={{ opacity: playing ? 1 : 0 }}
      />

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
            title={`${strings.playground.transport.pause} — ${strings.playground.transport.spaceHint}`}
            icon={<Pause size={15} weight="fill" />}
            onClick={pause}
            disabled={disabled}
          />
        ) : (
          <IconButton
            aria-label={strings.playground.transport.play}
            title={`${strings.playground.transport.play} — ${strings.playground.transport.spaceHint}`}
            icon={<Play size={15} weight="fill" />}
            variant="primary"
            onClick={play}
            disabled={disabled}
            className={disabled ? undefined : "glow-accent"}
          />
        )}
        <IconButton
          aria-label={strings.playground.transport.stop}
          icon={<Stop size={15} weight="fill" />}
          onClick={stop}
          disabled={disabled}
        />
      </div>

      <div className="relative">
        <Display value={formatPosition(position, beatsPerBar)} size="md" />
        {/* Running indicator on the position readout. */}
        {playing && (
          <span aria-hidden className="absolute -right-1 -top-1 flex size-2">
            <span className="anim-ring absolute inset-0 rounded-full text-accent" />
            <span className="relative size-2 rounded-full bg-accent" />
          </span>
        )}
      </div>

      <Divider />

      {/* Tempo is labelled in plain words with the unit kept beside it, so
          the number stays meaningful to somebody who has never said "BPM". */}
      <label className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.transport.speed}
          <HelpTip term="bpm" placement="bottom" />
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
          className="material-sunken motion-ui w-16 rounded-[var(--radius-control)] px-2 py-1 text-center font-mono text-sm text-ink outline-none focus:shadow-[var(--halo)]"
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.transport.bpm}
        </span>
      </label>

      <div className="flex items-center gap-1">
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
        <HelpTip term="swing" placement="bottom" />
      </div>

      <Divider />

      <div className="flex items-center gap-1">
        <Toggle
          checked={metronome}
          onChange={(on) => {
            setMetronome(on);
            engineRef.current?.setMetronome(on);
          }}
          label={strings.playground.transport.metronome}
          led={metronome ? "on" : "off"}
        />
        <HelpTip term="metronome" placement="bottom" />
      </div>

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
        <HelpTip term="loop" placement="bottom" />
        {/* Bars, not beats: the loop is set the way it is counted in. */}
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.transport.loopFromBar}
          <input
            type="number"
            min={1}
            step={1}
            value={loopStartBar}
            aria-label={`${strings.playground.transport.loop} ${strings.playground.transport.loopFromBar}`}
            onChange={(e) => applyLoop(Number(e.target.value), loopLengthBars)}
            className={numberFieldClass}
          />
        </label>
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {strings.playground.transport.loopBars}
          <input
            type="number"
            min={1}
            step={1}
            value={loopLengthBars}
            aria-label={`${strings.playground.transport.loop} ${strings.playground.transport.loopBars}`}
            onChange={(e) => applyLoop(loopStartBar, Number(e.target.value))}
            className={numberFieldClass}
          />
        </label>
      </div>

      {/* The one shortcut worth teaching in the chrome itself. */}
      <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {strings.playground.transport.spaceHint}
      </span>
    </div>
  );
}
