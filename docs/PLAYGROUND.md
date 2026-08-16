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
[ pattern strip (thumbnails, always visible) | Pattern / Piano Roll tabs ]
[                     bottom editor: Pattern | Piano Roll            ]
```

## Transport

Play, pause, stop, return to start, BPM (30-300), swing, metronome, and a loop
set the way it is counted — from bar N, M bars long (stored as beats). Position
is displayed as bars.beats.subdivision and is driven by the engine at display
rate. Stop cancels every scheduled event and releases sounding notes. Transport
state is shared across both sections: navigating to the Studio while playing
does not interrupt playback.

**Space is play/pause.** The Playground claims it for the whole section,
including while a step button has focus (where the browser would otherwise
re-toggle that step), and releases it only to text fields and selects. Clicking
the bar ruler moves the playhead.

## Tracks

Instrument and audio tracks. A row is two lines — identity (colour, name,
mute, solo) and mix (sound, volume, pan) — with reorder, duplicate, delete and
`Edit in Studio` behind one menu, so the sound selector keeps a readable width.

Each track carries: name, sound assignment, volume, pan, mute, solo, colour
token, reorder, duplicate, delete, and `Edit in Studio`. Solo mutes every
non-soloed track. Colours come from eight controlled tokens, not arbitrary
values.

A track row and its timeline lane are the same object seen twice, so they are
kept on the same line: both take their geometry from `playground/layout.ts`
(one row height, one ruler height — the track list carries a spacer where the
timeline carries its sticky bar ruler), and the two scrollers mirror each
other's vertical position.

## Timeline

Bar grid with configurable snap (1 bar, 1/4, 1/8, 1/16) and zoom. Clips are
dragged and resized with the pointer and snap to the grid; arrow keys nudge a
focused clip and Delete removes it. New clips land at the playhead while
playing, otherwise after the last clip on the track, so repeated inserts never
stack. Double-clicking an instrument lane also creates a pattern clip at that
position.

Clips draw their own content: a pattern clip renders its notes, tiled once per
repetition, so the arrangement reads as music instead of as labelled boxes.
Dragging a clip vertically moves it to another track — which is how a pattern
changes instrument.

Two clip kinds:

- **PatternClip** references a pattern, with start, length, loop, transpose and
  velocity multiplier.
- **AudioClip** references an audio asset, with start, length, source offset,
  gain, fade in/out and loop.

Audio clips play through their track bus, so track volume, pan, mute, solo and
per-track effects all apply to them. When the transport loop is enabled, audio
clips are rescheduled for each loop pass.

## Which instrument a pattern plays

A pattern owns notes, not a sound. What it sounds like is decided by **where it
is placed**: a clip on a track, and that track's assigned sound. No view offers
an instrument selector; `patternTarget.ts` resolves the instrument from the
arrangement (selected clip → selected track → first placement) and the editors
state it in their header. Drag the clip onto the bass lane and the same pattern
is a bass line, in the editor's preview as well as in playback.

A pattern created from the Playground is placed as it is created, so it never
exists without an instrument. One that ends up unplaced (its clip deleted) says
so and offers to place itself on the selected track.

## Previews

Every pattern is visible before it is chosen. `patternGeometry.ts` turns a note
list into normalised rectangles, and `PatternPreview` draws them in the pattern
strip, on timeline clips and in the inspector — the same picture at three
sizes. The strip's play button auditions the pattern through its placement's
instrument, layered over a running transport; queued notes are dropped on stop,
so cancelling an audition never cuts the arrangement.

## Pattern Editor and Piano Roll

Both edit the same `Pattern.notes: NoteEvent[]`. There is no second copy of
note data anywhere in the system. Both audition through the placement's
instrument, never through the Studio's preview engine.

- **Pattern Editor** is a step grid: configurable length (1, 2 or 4 bars) and
  resolution (1/8, 1/16, 1/32). Toggling a step creates or deletes a real note
  and previews it. Selected notes expose velocity and gate knobs. The playing
  step is highlighted, and a column ruler numbers the beats. The pitch window
  is fitted to the pattern's own notes when it is opened (a fixed octave from
  middle C hid every bass line) and then held still while it is edited; the
  octave arrows move it and report how many notes sit outside it.
- **Piano Roll** offers create (double-click), move, resize, delete
  (double-click a note), single and shift multi-select, quantize, snap, zoom,
  arrow-key nudging, and a synchronised playhead. Note opacity reflects
  velocity.

A note drawn off the step grid keeps its exact timing in the model; the step
grid marks it with `*` at its nearest step instead of rewriting it.

## Inspector

Contextual on the selection:

- **Track**: name, assigned sound, volume, pan, `Edit in Studio`.
- **Pattern clip**: thumbnail, pattern, the track and sound it plays through,
  start, length, transpose, velocity multiplier, loop.
- **Note**: pitch, start, duration, velocity, mute, delete.
- **Audio clip**: start, length, offset, gain, fade in, fade out, loop,
  `Edit in Studio`.

## Scheduling

`usePlaybackSync` is the only bridge between the store and the engine. It
creates and removes track buses, assigns sounds, pushes mixer values, flattens
each track's pattern clips into one absolute-time note list, and schedules
audio clips. It reacts to state changes only; nothing in React runs at audio
rate.

Every push is guarded on what actually changed. The project document is
immutable, so a new object arrives on every fader move; reacting to the object
rather than to its parts rebuilt each track's sound engine (cutting every
ringing voice) and restarted every audio clip many times a second while
dragging. Sounds are re-assigned only when the patch identity changes, patterns
rescheduled only for tracks whose clips or patterns changed, and audio clips
rescheduled only when `audioClipSignature` changes.
