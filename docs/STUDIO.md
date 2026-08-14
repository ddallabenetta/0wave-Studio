# Studio

The Studio is where sounds are created and prepared. It never contains the
arrangement timeline, the global piano roll, or the song structure: those live
in the Playground.

## What the central view shows

There is no mode bar. The Studio has one left panel — the sound library —
and a central view that follows from what is selected there.

| State | What the centre shows |
|---|---|
| A synth sound is open | The synthesizer editor |
| A sample sound is open | The sample editor: non-destructive waveform editing |
| Recording | Microphone capture with real input metering |
| Importing | Drag and drop or file picker with validation and decoding |

Selecting a sound in the library opens the editor its type calls for, so a
sample can never end up in the synth editor. Recording and importing are
temporary states, not destinations: they are entered from the library's "+",
and left either by saving the new sound — which opens it in the sample editor
— or by pressing Close.

`strings.studio.modeHints` still carries the one-line, plain-language
explanation of each of these; the record and import panels show theirs while
hints are on, and the synth editor shows its own.

## Layout

```
[ Sound Library | name + Simple/Full control | Analyzer / AI Connector ]
[      "+"      | editor for the open sound  |                         ]
[                      musical keyboard                                ]
```

Nothing in the Studio repeats itself. The sound's name is the editor's
heading (renaming is in the row menu, not a second field); Simple/Full
control belongs to the synth editor because that is the only thing it
changes; and the library is the left panel rather than also being a mode.

## Adding a sound

The "+" at the foot of the library asks which kind of sound is being added:

- **Build a sound** — opens the guided preset picker (`NewSoundDialog`).
- **Record from microphone** — puts the central view into capture.
- **Import an audio file** — puts the central view into import.

## Synth editor

Parameters follow the signal flow: **SOURCE, SHAPE, MOTION, SPACE, OUTPUT**.

- SOURCE: two oscillators (waveform, octave, semitone, detune; phase, unison
  and spread in Advanced), noise with a white-to-pink colour control, and the
  oscillator/noise mixer.
- SHAPE: multimode filter (low-pass, high-pass, band-pass), cutoff, resonance,
  bipolar filter-envelope amount, amp ADSR, filter ADSR.
- MOTION: one LFO with waveform, destination (pitch, filter cutoff, amplitude),
  rate, depth, free/sync mode, and beat division in Advanced.
- SPACE: the four effects in fixed order (distortion, chorus, delay, reverb),
  each individually bypassable.
- OUTPUT: gain and velocity sensitivity.

**Basic vs Advanced.** Basic shows the essential controls plus four macros;
Advanced exposes everything. The macros are aliases of real parameters
(Brightness = filter cutoff, Movement = LFO depth, Punch = amp attack,
Space = reverb mix), so what you hear is exactly what is saved. There is no
hidden randomisation.

Every knob is a `role="slider"` with `aria-valuenow` / `aria-valuetext`,
responds to arrows, Page Up/Down, Home/End, and resets on double-click or
Alt+click.

## Sound handling

Editing a sound writes straight to the project store and the engine. Edits are
persisted by autosave, so there is no separate "save" step and no button that
pretends to do one.

Everything a single sound can do lives in its own row in the library: the row
itself opens the sound, the play button auditions it, and the "..." menu
offers

- **Rename** - in place, in the row.
- **Duplicate** - copies the sound and opens the copy.
- **Duplicate before editing** - the same action, renamed, when the sound is
  already used by a track, per ADR-005.
- **Use in Playground** - marks the sound for handoff and navigates to the
  Playground, which assigns it to a free track or creates one.
- **Delete** - after a confirmation.

### Shared-sound behaviour (ADR-005)

Tracks reference `soundId`; they never copy the sound. Editing a sound in the
Studio changes it live everywhere it is used. Undo (Cmd/Ctrl+Z) covers
mistakes, and `Duplicate before editing` is offered when the sound is in use.

## Recording

The microphone permission is only requested after an explicit button press.
Input level comes from a real analyser on the capture stream. `MediaRecorder`
support and mime type are detected before recording; pause is only offered when
the browser supports it. Errors are mapped precisely: permission denied, no
device, device disconnected mid-session, and unsupported browser each have
their own message. A finished take is decoded and opened in the Sample Editor.

## Import

Drag and drop or file picker. Validation covers type, size (50 MB), and decoded
duration (600 s). Decoding uses the browser's own decoder, so support is
whatever the browser provides; failures report a clear message instead of a
silent no-op. The original file is stored untouched as the asset blob.

## Sample Editor

The waveform is drawn from real min/max peaks of the decoded buffer for the
visible window, with zoom and scroll. Trim and loop markers are draggable, and
the trimmed-away regions are dimmed.

All edits are non-destructive parameters on `SampleState`: trim, fades, gain,
normalize (computes the real peak and sets gain accordingly), reverse, loop
points, playback mode (one-shot, loop, instrument), root note, tuning, amp
envelope, filter, and the effect chain. The original asset is never rewritten.
