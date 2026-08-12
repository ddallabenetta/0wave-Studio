# Studio

The Studio is where sounds are created and prepared. It never contains the
arrangement timeline, the global piano roll, or the song structure: those live
in the Playground.

## Modes

Modes are internal to the Studio and never compete with the two main
destinations in the top bar.

| Mode | What it does |
|---|---|
| Synth | Full subtractive synthesizer editor |
| Record | Microphone capture with real input metering |
| Import | Drag and drop or file picker with validation and decoding |
| Sample Editor | Non-destructive waveform editing for a `SampleSound` |
| Sound Library | The project's sounds; also always visible as the left panel |

## Layout

```
[ mode tabs | Basic/Advanced | sound name | Init Patch | Save as New | Use in Playground ]
[ Sound Library | editor for the active mode | Analyzer ]
[                      musical keyboard                     ]
```

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
pretends to do one. The header offers:

- **Init Patch** - creates a fresh default synth sound and opens it.
- **Save as New** - duplicates the current sound.
- **Duplicate before editing** - shown instead of Save as New when the sound is
  already used by a track, per ADR-005.
- **Use in Playground** - marks the sound for handoff and navigates to the
  Playground, which assigns it to a free track or creates one.

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
