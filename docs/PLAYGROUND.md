# Playground

The Playground turns sounds prepared in the Studio into patterns and
arrangements. It does not duplicate the synthesizer editor: deep sound editing
happens in the Studio, one click away via `Edit in Studio`.

## Empty state

With no tracks, the Playground replaces the timeline with an offer rather
than an empty grid: **Build me a starting loop** creates four tracks, four
patterns and a four-bar loop (see `lib/presets/starterLoop.ts`), and
**I'll start from an empty track** does the manual thing. An empty
arrangement asks for a track, a sound, a pattern, a clip and a set of notes
before it makes any sound at all, which is where a newcomer stops.

## Layout

```
[ transport: play/pause/stop/return, position, BPM, swing, metronome, loop ]
[ track list + mixer | timeline (bars, clips, playhead) | inspector ]
[                     bottom editor: Pattern | Piano Roll            ]
```

## Transport

Play, pause, stop, return to start, BPM (30-300), swing, metronome, loop
enable with start/end beats. Position is displayed as bars.beats.subdivision
and is driven by the engine at display rate. Stop cancels every scheduled event
and releases sounding notes. Transport state is shared across both sections:
navigating to the Studio while playing does not interrupt playback.

## Tracks

Instrument and audio tracks. Each track carries: name, sound assignment,
volume, pan, mute, solo, colour token, reorder, duplicate, delete, and
`Edit in Studio`. Solo mutes every non-soloed track. Colours come from eight
controlled tokens, not arbitrary values.

## Timeline

Bar grid with configurable snap (1 bar, 1/4, 1/8, 1/16) and zoom. Clips are
dragged and resized with the pointer and snap to the grid; arrow keys nudge a
focused clip and Delete removes it. New clips land at the playhead while
playing, otherwise after the last clip on the track, so repeated inserts never
stack. Double-clicking an instrument lane also creates a pattern clip at that
position.

Two clip kinds:

- **PatternClip** references a pattern, with start, length, loop, transpose and
  velocity multiplier.
- **AudioClip** references an audio asset, with start, length, source offset,
  gain, fade in/out and loop.

Audio clips play through their track bus, so track volume, pan, mute, solo and
per-track effects all apply to them. When the transport loop is enabled, audio
clips are rescheduled for each loop pass.

## Pattern Editor and Piano Roll

Both edit the same `Pattern.notes: NoteEvent[]`. There is no second copy of
note data anywhere in the system.

- **Pattern Editor** is a step grid: configurable length (1, 2 or 4 bars) and
  resolution (1/8, 1/16, 1/32). Toggling a step creates or deletes a real note
  and previews it. Selected notes expose velocity and gate knobs. The playing
  step is highlighted.
- **Piano Roll** offers create (double-click), move, resize, delete
  (double-click a note), single and shift multi-select, quantize, snap, zoom,
  arrow-key nudging, and a synchronised playhead. Note opacity reflects
  velocity.

A note drawn off the step grid keeps its exact timing in the model; the step
grid marks it with `*` at its nearest step instead of rewriting it.

## Inspector

Contextual on the selection:

- **Track**: name, assigned sound, volume, pan, `Edit in Studio`.
- **Pattern clip**: pattern, start, length, transpose, velocity multiplier, loop.
- **Note**: pitch, start, duration, velocity, mute, delete.
- **Audio clip**: start, length, offset, gain, fade in, fade out, loop,
  `Edit in Studio`.

## Scheduling

`usePlaybackSync` is the only bridge between the store and the engine. It
creates and removes track buses, assigns sounds, pushes mixer values, flattens
each track's pattern clips into one absolute-time note list, and schedules
audio clips. It reacts to state changes only; nothing in React runs at audio
rate.
