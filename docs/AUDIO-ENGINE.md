# Audio Engine

Framework-independent Web Audio layer under `src/lib/audio`. No React, no
zustand, no Next APIs. The UI talks to it only through `IAudioEngine`
(`api.ts`); the singleton accessor is `getAudioEngine()` in `index.ts`, which
dynamic-imports the implementation so nothing touches Web Audio during SSR.

## Modules

| File | Responsibility |
|---|---|
| `engine.ts` | `createAudioEngine()`, AudioContext lifecycle, track registry, facade for every `IAudioEngine` method |
| `master.ts` | master gain, `DynamicsCompressor` limiter, scope + spectrum analysers, clip detection |
| `synth.ts` | 8-voice polyphonic synth: oscillators (with unison), noise, mixer, filter, amp/filter envelopes, LFO |
| `sampler.ts` | sample playback honoring `SampleState` (trim, fades, gain, reverse, loop points, root note, tuning) |
| `effects.ts` | effect chain in `EFFECT_ORDER`: distortion, chorus, delay, reverb |
| `transport.ts` | lookahead scheduler, `PatternScheduler`, `TrackBus`, metronome, loop range, swing |
| `audioClips.ts` | arrangement audio clips routed through the track bus |
| `analyzer.ts` | preallocated frame reads for the UI |
| `input.ts` | microphone monitor and input level |

## Clock and scheduling

There is no Tone.js (see ADR-002). `TransportEngine` wakes every 25 ms via
`setInterval` and schedules everything that falls inside the next 120 ms
against `AudioContext.currentTime`. The timer only *wakes* the scheduler; every
event time is an audio-clock time, so there is no timer drift and no audible
jitter.

- Beats are the musical unit; `beatsToSeconds` converts at the current tempo.
- Swing shifts odd subdivisions using `swingOffsetBeats`. The subdivision grid
  is inferred from the note starts in the pattern.
- Loop range wraps the unwrapped position; notes repeat every loop length.
- `cancelScheduled()` clears pending events and releases sounding notes.

The scheduler holds **one note list per track**. The Playground therefore
flattens all pattern clips of a track into a single absolute-time list
(`flattenTrackNotes`), baking per-clip transpose and velocity multiplier.

## Signal path

```
SynthVoice / SamplerVoice / AudioClip source
        -> per-track gain -> stereo panner -> track effects
        -> master gain -> limiter -> destination
                       \-> scope analyser + spectrum analyser
```

Studio preview (keyboard, library auditions) runs through a dedicated synth and
sampler pair connected straight to the master bus, so previewing never disturbs
arrangement tracks.

## Parameter updates

`setParameter(path, value)` takes dot paths into `SynthState`
(`filter.cutoff`, `osc1.waveform`, `effects.2.params.mix`, …). Continuous values
are applied with `setTargetAtTime` smoothing; discrete changes (waveform, filter
mode) rebuild nodes behind a short fade. Nothing is animated through React
state, and no React render happens per audio frame.

## Voice management

Eight voices. Allocation prefers a free slot, then the oldest released voice,
then the oldest voice overall, so stealing is predictable. Every voice releases
its envelope on note-off and disposes its nodes after the release tail.

## Robustness notes

- The reverb impulse response is generated at the context sample rate. Some
  environments report a rate the `ConvolverNode` does not accept; the stage
  tries alternate rates and, failing all of them, stays dry rather than taking
  the engine down.
- `initialize()` is safe to call repeatedly; it resumes an existing context.
- Context `statechange` is mirrored into the engine status
  (`running` / `suspended` / `error`), which the UI shows in the status pill.
- `dispose()` disconnects every node, stops sources, clears timers, and closes
  the context.
