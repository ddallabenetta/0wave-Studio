"use client";

/**
 * Track list with the essential mixer: sound assignment, volume, pan, mute,
 * solo, and a direct route back into the Studio for deep sound editing.
 */
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash, ArrowUp, ArrowDown, PencilSimple } from "@phosphor-icons/react";
import { Button, Fader, IconButton } from "@/components/controls";
import { useProjectStore } from "@/lib/state/project-store";
import { useUiStore } from "@/lib/state/ui-store";
import { strings } from "@/i18n";
import { useState } from "react";

export const TRACK_ROW_HEIGHT = 64;

export function TrackList() {
  const router = useRouter();
  const tracks = useProjectStore((s) => s.project.tracks);
  const sounds = useProjectStore((s) => s.project.sounds);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const duplicateTrack = useProjectStore((s) => s.duplicateTrack);
  const deleteTrack = useProjectStore((s) => s.deleteTrack);
  const reorderTracks = useProjectStore((s) => s.reorderTracks);
  const assignSoundToTrack = useProjectStore((s) => s.assignSoundToTrack);

  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setEditingSoundId = useUiStore((s) => s.setEditingSoundId);
  const setStudioMode = useUiStore((s) => s.setStudioMode);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const editInStudio = (soundId: string | undefined) => {
    if (!soundId) return;
    setEditingSoundId(soundId);
    const sound = sounds.find((s) => s.id === soundId);
    setStudioMode(sound?.type === "sample" ? "sample" : "synth");
    router.push("/studio");
  };

  return (
    <div className="flex h-full flex-col border-r border-edge bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-edge px-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          {strings.playground.inspector.track}
        </span>
        <div className="flex gap-1">
          <Button size="sm" icon={<Plus size={12} weight="bold" />} onClick={() => addTrack("instrument")}>
            {strings.playground.tracks.addInstrument}
          </Button>
          <Button size="sm" onClick={() => addTrack("audio")}>
            {strings.playground.tracks.addAudio}
          </Button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {tracks.length === 0 && (
          <li className="p-4 text-xs leading-relaxed text-ink-faint">
            {strings.playground.tracks.addTrack}
          </li>
        )}
        {tracks.map((track, index) => {
          const selected = selection?.kind === "track" && selection.trackId === track.id;
          return (
            <li
              key={track.id}
              style={{ height: TRACK_ROW_HEIGHT }}
              className={`flex items-center gap-2 border-b border-edge px-2 ${selected ? "bg-accent-wash" : ""}`}
              onPointerDown={() => setSelection({ kind: "track", trackId: track.id })}
            >
              <span
                aria-hidden
                className="h-10 w-1 rounded-full"
                style={{ background: `var(--${track.colorToken})` }}
              />

              {/* Two lines: identity and actions on top, mix below, so the
                  sound selector stays wide enough to read. */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="flex min-w-0 items-center gap-1">
                  {renamingId === track.id ? (
                    <input
                      autoFocus
                      defaultValue={track.name}
                      aria-label={strings.playground.tracks.rename}
                      onBlur={(e) => {
                        renameTrack(track.id, e.target.value);
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="material-sunken min-w-0 flex-1 rounded-[var(--radius-control)] px-1 text-xs text-ink outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onDoubleClick={() => setRenamingId(track.id)}
                      title={strings.playground.tracks.rename}
                      className="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink"
                    >
                      {track.name}
                    </button>
                  )}

                  <button
                    type="button"
                    aria-pressed={track.mute}
                    aria-label={`${strings.playground.tracks.mute} ${track.name}`}
                    onClick={() => updateTrack(track.id, (t) => void (t.mute = !t.mute))}
                    className={`material-raised motion-ui rounded-[var(--radius-control)] px-1.5 py-0.5 font-mono text-[10px] ${
                      track.mute ? "bg-warning text-ink-inverse" : "text-ink-soft"
                    }`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    aria-pressed={track.solo}
                    aria-label={`${strings.playground.tracks.solo} ${track.name}`}
                    onClick={() => updateTrack(track.id, (t) => void (t.solo = !t.solo))}
                    className={`material-raised motion-ui rounded-[var(--radius-control)] px-1.5 py-0.5 font-mono text-[10px] ${
                      track.solo ? "bg-accent text-accent-on" : "text-ink-soft"
                    }`}
                  >
                    S
                  </button>
                  <IconButton
                    aria-label={strings.studio.editInStudio}
                    size="sm"
                    variant="ghost"
                    icon={<PencilSimple size={11} />}
                    disabled={!track.soundId}
                    onClick={() => editInStudio(track.soundId)}
                  />
                  <IconButton
                    aria-label={strings.playground.tracks.duplicateTrack}
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={11} />}
                    onClick={() => duplicateTrack(track.id)}
                  />
                  <IconButton
                    aria-label="Move track up"
                    size="sm"
                    variant="ghost"
                    icon={<ArrowUp size={11} />}
                    disabled={index === 0}
                    onClick={() => reorderTracks(index, index - 1)}
                  />
                  <IconButton
                    aria-label="Move track down"
                    size="sm"
                    variant="ghost"
                    icon={<ArrowDown size={11} />}
                    disabled={index === tracks.length - 1}
                    onClick={() => reorderTracks(index, index + 1)}
                  />
                  <IconButton
                    aria-label={strings.playground.tracks.deleteTrack}
                    size="sm"
                    variant="ghost"
                    icon={<Trash size={11} />}
                    onClick={() => deleteTrack(track.id)}
                  />
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <select
                    value={track.soundId ?? ""}
                    aria-label={strings.playground.tracks.assignSound}
                    onChange={(e) => assignSoundToTrack(track.id, e.target.value || null)}
                    className="material-sunken min-w-0 flex-1 rounded-[var(--radius-control)] px-1 py-0.5 text-[11px] text-ink outline-none"
                  >
                    <option value="">{strings.playground.tracks.noSound}</option>
                    {sounds.map((sound) => (
                      <option key={sound.id} value={sound.id}>
                        {sound.name}
                      </option>
                    ))}
                  </select>
                  <Fader
                    label={strings.playground.tracks.volume}
                    value={track.volume}
                    min={0}
                    max={1}
                    defaultValue={0.8}
                    orientation="horizontal"
                    length={70}
                    onChange={(v) => updateTrack(track.id, (t) => void (t.volume = v))}
                  />
                  <Fader
                    label={strings.playground.tracks.pan}
                    value={track.pan}
                    min={-1}
                    max={1}
                    defaultValue={0}
                    orientation="horizontal"
                    length={54}
                    onChange={(v) => updateTrack(track.id, (t) => void (t.pan = v))}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
