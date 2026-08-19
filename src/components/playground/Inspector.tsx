"use client";

/**
 * Contextual inspector: track, pattern clip, audio clip, or note, depending
 * on the current selection. Every field writes to the project store.
 */
import { useRouter } from "next/navigation";
import { Button, Knob } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { noteToName } from "@/lib/music/theory";
import { Panel } from "@/components/studio/Panel";
import { PatternPreview } from "./PatternPreview";
import { clipRepeats } from "./patternGeometry";
import { strings } from "@/i18n";

export function Inspector() {
  const router = useRouter();
  const selection = useUiStore((s) => s.selection);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateNote = useProjectStore((s) => s.updateNote);
  const deleteNote = useProjectStore((s) => s.deleteNote);

  if (!selection) {
    return (
      <Panel title={strings.playground.inspector.track}>
        <p className="p-4 text-xs leading-relaxed text-ink-faint">
          {strings.playground.tracks.addTrack}
        </p>
      </Panel>
    );
  }

  const openInStudio = (soundId?: string) => {
    if (!soundId) return;
    setEditingSoundId(soundId);
    const sound = project.sounds.find((s) => s.id === soundId);
    setStudioMode(sound?.type === "sample" ? "sample" : "synth");
    router.push("/studio");
  };

  if (selection.kind === "track") {
    const track = project.tracks.find((t) => t.id === selection.trackId);
    if (!track) return null;
    const sound = project.sounds.find((s) => s.id === track.soundId);
    return (
      <Panel title={strings.playground.inspector.track}>
        <div className="flex flex-col gap-3 p-3">
          <input
            value={track.name}
            aria-label={strings.common.name}
            onChange={(e) => updateTrack(track.id, (t) => void (t.name = e.target.value || t.name))}
            className="material-sunken rounded-[var(--radius-control)] px-2 py-1 text-xs text-ink outline-none"
          />
          <p className="font-mono text-[10px] text-ink-faint">
            {sound ? sound.name : strings.playground.tracks.noSound}
          </p>
          <div className="flex flex-wrap gap-3">
            <Knob
              label={strings.playground.tracks.volume}
              value={track.volume}
              min={0}
              max={1}
              defaultValue={0.8}
              size={40}
              onChange={(v) => updateTrack(track.id, (t) => void (t.volume = v))}
            />
            <Knob
              label={strings.playground.tracks.pan}
              value={track.pan}
              min={-1}
              max={1}
              defaultValue={0}
              size={40}
              onChange={(v) => updateTrack(track.id, (t) => void (t.pan = v))}
            />
          </div>
          <Button size="sm" disabled={!track.soundId} onClick={() => openInStudio(track.soundId)}>
            {strings.studio.editInStudio}
          </Button>
        </div>
      </Panel>
    );
  }

  if (selection.kind === "note") {
    const pattern = project.patterns.find((p) => p.id === selection.patternId);
    const note = pattern?.notes.find((n) => n.id === selection.noteId);
    if (!pattern || !note) return null;
    return (
      <Panel title={strings.playground.inspector.note}>
        <div className="flex flex-col gap-3 p-3">
          <p className="font-mono text-sm text-ink">{noteToName(note.pitch)}</p>
          <div className="flex flex-wrap gap-3">
            <Knob
              label={strings.playground.inspector.pitch}
              value={note.pitch}
              min={0}
              max={127}
              step={1}
              defaultValue={60}
              size={40}
              format={(v) => noteToName(Math.round(v))}
              onChange={(v) => updateNote(pattern.id, note.id, (n) => void (n.pitch = Math.round(v)))}
            />
            <Knob
              label={strings.playground.inspector.start}
              value={note.startBeat}
              min={0}
              max={Math.max(4, pattern.lengthBeats)}
              defaultValue={0}
              size={40}
              onChange={(v) => updateNote(pattern.id, note.id, (n) => void (n.startBeat = v))}
            />
            <Knob
              label={strings.playground.inspector.duration}
              value={note.durationBeats}
              min={0.0625}
              max={8}
              defaultValue={0.25}
              size={40}
              onChange={(v) => updateNote(pattern.id, note.id, (n) => void (n.durationBeats = v))}
            />
            <Knob
              label={strings.playground.pattern.velocity}
              value={note.velocity}
              min={1}
              max={127}
              step={1}
              defaultValue={100}
              size={40}
              onChange={(v) => updateNote(pattern.id, note.id, (n) => void (n.velocity = Math.round(v)))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => updateNote(pattern.id, note.id, (n) => void (n.muted = !n.muted))}
            >
              {note.muted ? strings.common.enabled : strings.playground.tracks.mute}
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleteNote(pattern.id, note.id)}>
              {strings.playground.inspector.deleteNote}
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  const track = project.tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);
  if (!track || !clip) return null;

  if (clip.kind === "pattern") {
    const pattern = project.patterns.find((p) => p.id === clip.patternId);
    const sound = project.sounds.find((s) => s.id === track.soundId);
    return (
      <Panel title={strings.playground.inspector.patternClip}>
        <div className="flex flex-col gap-3 p-3">
          {/* The clip's own notes, at the repetition count it will play. */}
          <PatternPreview
            pattern={pattern}
            color={`var(--${track.colorToken})`}
            repeats={clipRepeats(clip.lengthBeats, pattern?.lengthBeats ?? 4, clip.loopEnabled)}
            className="h-12 w-full rounded-[var(--radius-control)] bg-surface-sunken text-ink-faint"
          />
          <p className="font-mono text-[11px] text-ink-soft">{pattern?.name}</p>
          {/* What it will be heard through — a fact of the arrangement, not
              a setting of the pattern. */}
          <p className="flex items-center gap-1.5 truncate font-mono text-[10px] text-ink-faint">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(--${track.colorToken})` }}
            />
            {strings.playground.pattern.playsOn} {track.name}
            {sound ? ` · ${sound.name}` : ` · ${strings.playground.tracks.noSound}`}
          </p>
          <div className="flex flex-wrap gap-3">
            <Knob
              label={strings.playground.inspector.start}
              value={clip.startBeat}
              min={0}
              max={256}
              defaultValue={0}
              size={40}
              onChange={(v) => updateClip(track.id, clip.id, (c) => void (c.startBeat = v))}
            />
            <Knob
              label={strings.playground.inspector.lengthBeats}
              value={clip.lengthBeats}
              min={0.25}
              max={64}
              defaultValue={4}
              size={40}
              onChange={(v) => updateClip(track.id, clip.id, (c) => void (c.lengthBeats = v))}
            />
            <Knob
              label={strings.playground.inspector.transpose}
              value={clip.transpose}
              min={-24}
              max={24}
              step={1}
              defaultValue={0}
              size={40}
              onChange={(v) =>
                updateClip(track.id, clip.id, (c) => {
                  if (c.kind === "pattern") c.transpose = Math.round(v);
                })
              }
            />
            <Knob
              label={strings.playground.inspector.velocityMultiplier}
              value={clip.velocityMultiplier}
              min={0}
              max={2}
              defaultValue={1}
              size={40}
              onChange={(v) =>
                updateClip(track.id, clip.id, (c) => {
                  if (c.kind === "pattern") c.velocityMultiplier = v;
                })
              }
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              updateClip(track.id, clip.id, (c) => {
                if (c.kind === "pattern") c.loopEnabled = !c.loopEnabled;
              })
            }
          >
            {strings.playground.transport.loop}: {clip.loopEnabled ? strings.common.on : strings.common.off}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={strings.playground.inspector.audioClip}>
      <div className="flex flex-col gap-3 p-3">
        <p className="truncate font-mono text-[11px] text-ink-soft">
          {project.assets.find((a) => a.id === clip.assetId)?.originalFilename}
        </p>
        <div className="flex flex-wrap gap-3">
          <Knob
            label={strings.playground.inspector.start}
            value={clip.startBeat}
            min={0}
            max={256}
            defaultValue={0}
            size={40}
            onChange={(v) => updateClip(track.id, clip.id, (c) => void (c.startBeat = v))}
          />
          <Knob
            label={strings.playground.inspector.lengthBeats}
            value={clip.lengthBeats}
            min={0.25}
            max={64}
            defaultValue={4}
            size={40}
            onChange={(v) => updateClip(track.id, clip.id, (c) => void (c.lengthBeats = v))}
          />
          <Knob
            label={strings.playground.inspector.offset}
            value={clip.offsetSeconds}
            min={0}
            max={30}
            defaultValue={0}
            unit="s"
            size={40}
            onChange={(v) =>
              updateClip(track.id, clip.id, (c) => {
                if (c.kind === "audio") c.offsetSeconds = v;
              })
            }
          />
          <Knob
            label={strings.playground.inspector.gain}
            value={clip.gain}
            min={0}
            max={2}
            defaultValue={1}
            size={40}
            onChange={(v) =>
              updateClip(track.id, clip.id, (c) => {
                if (c.kind === "audio") c.gain = v;
              })
            }
          />
          <Knob
            label={`${strings.playground.inspector.fade} in`}
            value={clip.fadeIn}
            min={0}
            max={5}
            defaultValue={0}
            unit="s"
            size={40}
            onChange={(v) =>
              updateClip(track.id, clip.id, (c) => {
                if (c.kind === "audio") c.fadeIn = v;
              })
            }
          />
          <Knob
            label={`${strings.playground.inspector.fade} out`}
            value={clip.fadeOut}
            min={0}
            max={5}
            defaultValue={0}
            unit="s"
            size={40}
            onChange={(v) =>
              updateClip(track.id, clip.id, (c) => {
                if (c.kind === "audio") c.fadeOut = v;
              })
            }
          />
        </div>
        <Button
          size="sm"
          onClick={() =>
            updateClip(track.id, clip.id, (c) => {
              if (c.kind === "audio") c.loopEnabled = !c.loopEnabled;
            })
          }
        >
          {strings.playground.transport.loop}: {clip.loopEnabled ? strings.common.on : strings.common.off}
        </Button>
        <Button size="sm" disabled={!track.soundId} onClick={() => openInStudio(track.soundId)}>
          {strings.studio.editInStudio}
        </Button>
      </div>
    </Panel>
  );
}
