# Backlog: Playground user experience

Not implemented. This is the list of things that would make the Playground
better to use, written after the review that landed the pattern previews,
placement-driven instruments, the space bar transport and the mixing fixes.

Each entry says what it is, why it earns its place, and where it would touch the
code, so the next person can start without re-deriving the design. Ordered by
how much friction it removes per unit of work, not by how interesting it is.

## P1 — friction a first-time user hits today

| # | Proposal | Why | Touches |
|---|---|---|---|
| 1 | **Follow the playhead.** Auto-scroll the timeline (and the pattern grid) so the playing bar stays in view, with a toggle to pin it. | Past bar ~10 at default zoom, playback runs off screen and the arrangement stops being watchable. | `Timeline.tsx` (scroll on position change, respecting user scrolling) |
| 2 | **Loop bracket on the ruler.** Drag over the bar ruler to set the loop; the two number fields become a readout. | The loop is the main way to work on four bars, and it is currently typed rather than pointed at. | `Timeline.tsx` ruler, `Transport.tsx`, `setLoopRange` |
| 3 | **Undo/redo in the chrome.** Two buttons with state, next to the project name, plus the existing shortcut. | The store has 100 steps of undo (ADR-006) and nothing in the interface says so. Non-experts do not try Ctrl+Z on a music tool. | `TopBar.tsx`, `project-store` `canUndo/canRedo` |
| 4 | **Drag a sound from the library onto a lane.** Dropping on a track assigns it; dropping on empty space creates a track with it. | "Use in Playground" works but is a menu round trip; the drop is the gesture people try first. | `SoundLibraryPanel.tsx`, `TrackList.tsx`, `Timeline.tsx` |
| 5 | **Clip clipboard and multi-select.** Rubber-band select, `Cmd/Ctrl+C/V/D`, arrow-key move for a selection. | Building 16 bars from 4 means repeating clips; one-at-a-time duplication is the slowest part of the section. | `Timeline.tsx`, `ui-store` selection (would become a list) |
| 6 | **Resizable editor panel.** Drag the divider between the timeline and the note editor; remember the height. | 300 px suits a step grid and is tight for a piano roll; the choice belongs to the person looking at it. | `PlaygroundRoot.tsx`, `ui-store` |
| 7 | **Play the selected track from the computer keyboard.** The Studio's keyboard, in the Playground, routed through `previewTrackNotes`. | Trying a melody before drawing it is how melodies get written. The engine side already exists. | `Keyboard.tsx` reuse, `useTrackPreview.ts` |
| 8 | **Hold a modifier to bypass snap.** Alt while dragging a clip or a note gives free positioning. | Snap is right by default and wrong exactly when someone wants a flam or a swung hit. | `Timeline.tsx`, `PianoRoll.tsx` |
| 9 | **Per-track level meters.** A small meter in each track row, fed from a per-bus analyser. | Mute/solo answers "who is playing?" by elimination; a meter answers it directly, and shows which track is clipping. | `TrackBus` (analyser tap), `TrackList.tsx`, engine API |

## P2 — depth the section will need next

| # | Proposal | Why | Touches |
|---|---|---|---|
| 10 | **Waveform thumbnails on audio clips.** The same treatment pattern clips just got. | An audio clip is currently a coloured box with a filename; its shape is the only way to find the downbeat. | peak cache next to `sampleBuffers.ts`, `Timeline.tsx` |
| 11 | **"Make unique" for shared patterns.** Editing a pattern placed in several clips changes all of them; offer to fork on first edit, and show the placement count in the editor header. | This is the classic surprise of pattern-based sequencers. The chips already show the placements; the fork action is missing. | `PatternTargetChip.tsx`, `duplicatePattern` + clip repoint |
| 12 | **Per-track effects in the Playground.** The engine already accepts `setTrackEffects`; there is no UI for it. | Reverb on one track is mixing, not sound design, so it belongs here rather than in the Studio. | `EffectsSection.tsx` reuse, `Inspector.tsx`, `usePlaybackSync` |
| 13 | **Time signature.** The schema carries `beatsPerBar`; the UI is fixed at 4/4. | Everything downstream (ruler, bars, metronome accent) already reads the value. | `Transport.tsx`, `TransportEngine.setBeatsPerBar` |
| 14 | **Note tools.** Transpose/nudge a selection, velocity ramp across selected notes, humanise, and scale-aware pitch snapping. | The gap between "I placed notes" and "it sounds intentional" is mostly velocity and timing. | `PianoRoll.tsx`, `lib/music/theory.ts` |
| 15 | **Per-pattern swing.** Swing is global today; a swung hi-hat over a straight bass is a normal request. | `PatternScheduler` already infers the swing grid per pattern. | `schema` (`Pattern.swing`), `transport.ts`, `PatternEditor.tsx` |
| 16 | **Count-in.** One bar of clicks before playback or before recording; the string exists (`transport.countIn`) with nothing behind it. | Nobody can start playing on beat 1 without one. | `TransportEngine`, `Transport.tsx` |
| 17 | **Step recording and record-arm.** Arm a track, play the keyboard, land notes on the grid — quantised or not. | It is the fastest way to fill a pattern, and the one workflow the section has no answer for. | `Keyboard`, `Timeline`, `project-store` note writes |
| 18 | **Export audio.** Offline render of the loop or the arrangement to WAV. | Right now nothing made here can leave as audio; the project export is JSON only. | `OfflineAudioContext` render path mirroring the engine graph |
| 19 | **Markers and sections.** Name bars ("verse", "drop"), jump between them, loop a section by name. | Once an arrangement passes ~16 bars, bar numbers stop being names. | `schema`, `Timeline.tsx`, `Transport.tsx` |

## P3 — worth exploring, not obviously right

| # | Proposal | Why / risk |
|---|---|---|
| 20 | **Pattern generation through the AI connector.** Same validation boundary as the patch connector (`docs/BACKLOG-AI-CONNECTOR.md`), but the output is a `NoteEvent[]` for a named track. | The instrument is already known from the placement, which makes the prompt concrete ("a bass line for this"). Risk: generated music is much easier to dislike than a generated patch — the preview and diff story has to be excellent. |
| 21 | **WebMIDI in and out.** Play the selected track from a controller; drive external gear from the transport. | Cheap to add for input, and it makes the app usable with the hardware people already own. Risk: browser support and permission prompts. |
| 22 | **Touch layout below 1024 px.** ADR-010 says the app is honest about not fitting; a reduced Playground (pattern strip + step grid + transport) would fit a tablet. | A step sequencer is genuinely usable on a tablet. Risk: a second layout to maintain. |
| 23 | **Chord and scale helper.** Constrain the piano roll to a scale, offer chord stamps. | The largest gap between a non-musician and something that sounds right. Risk: it can become a genre-shaped straitjacket if it is not optional. |
| 24 | **Shared listening.** Supabase realtime presence so two people can watch the same arrangement play. | The persistence adapter already exists. Risk: conflict resolution is last-write-wins today (ADR-008), which is not enough for live editing. |

## Measurements worth taking before picking

- **Where the first session stops.** The starter loop removed the blank-page
  problem; the next stall is probably "how do I make this longer than four
  bars", which points at P1 #5 and P2 #19.
- **Voice load in the wild.** The pool now grows to 32 voices per instrument.
  Worth measuring the audio thread on a low-end laptop with eight tracks and a
  long-release pad before raising any ceiling further.
- **Whether previews changed pattern reuse.** Patterns are now visible and
  audible before use; if reuse goes up, P2 #11 ("make unique") becomes urgent
  rather than merely correct.
