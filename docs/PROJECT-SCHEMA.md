# Project Schema

Versioned serializable state for 0wave Studio. Source of truth:
`src/lib/schema/types.ts` (types), `schemas.ts` (zod runtime validation),
`factories.ts` (defaults), `migrations.ts` (version upgrades).

**Rules**
- Every change that breaks existing payloads bumps `SCHEMA_VERSION` and adds a
  migration in `migrations.ts`.
- Nothing in the schema holds an `AudioNode`, `AudioBuffer`, or `Blob`.
  Audio blobs live in the IndexedDB blob store keyed by `AudioAsset.localBlobKey`.
- All reads from disk/import/network go through `parseProject` (migrate → validate).

## Object graph

```
Project
├─ id, schemaVersion, name, tempo (30-300), timeSignature {beatsPerBar, beatUnit:4}
├─ loopRange {enabled, startBeat, endBeat}
├─ swing (0..1)
├─ sounds: SoundDefinition[]
│   ├─ type "synth"   → synthState: SynthState
│   └─ type "sample"  → sampleState: SampleState (references assetId)
├─ tracks: Track[]
│   ├─ type "instrument" | "audio"
│   ├─ soundId? → SoundDefinition (instrument tracks)
│   ├─ volume, pan, mute, solo, colorToken
│   ├─ effects: EffectState[] (EFFECT_ORDER)
│   └─ clips: (PatternClip | AudioClip)[]
├─ patterns: Pattern[]
│   └─ notes: NoteEvent[]   ← canonical note model (shared by both editors)
└─ assets: AudioAsset[]
```

## Key types

### NoteEvent (canonical)
`{ id, pitch (MIDI 0-127), startBeat, durationBeats (>0), velocity (0-127), muted }`
Time is in beats within its Pattern. Both the Pattern Editor and the Piano Roll
read and write these; there is never a second copy.

### SynthState
`osc1, osc2` (OscillatorState: waveform, octave, semitone, detuneCents, phase,
unison, unisonSpreadCents), `noise` (color 0=white 1=pink), `mixer` (osc1/osc2/noise
gains), `filter` (mode, cutoff Hz, resonance Q), `ampEnvelope` + `filterEnvelope`
(ADSR), `filterEnvAmount` (-1..1 bipolar), `lfo` (waveform, destination, rate,
depth, sync, syncBeats), `effects[4]` in `EFFECT_ORDER`, `output` (gain,
velocitySensitivity).

### SampleState
`assetId`, `trimStart/trimEnd` (s), `fadeIn/fadeOut` (s), `gain` (0..2),
`reversed`, `loopEnabled`, `loopStart/loopEnd` (s), `playbackMode`
(one-shot | loop | instrument), `rootNote`, `tuningCents`, `ampEnvelope`,
`filter`, `effects`. Editing is non-destructive; the original asset is never
overwritten except an explicit bounce (post-MVP).

### Clips
`PatternClip { kind:"pattern", patternId, startBeat, lengthBeats, loopEnabled, transpose, velocityMultiplier }`
`AudioClip   { kind:"audio", assetId, startBeat, lengthBeats, offsetSeconds, gain, fadeIn, fadeOut, loopEnabled, loopStart, loopEnd }`

### AudioAsset
Metadata only. `localBlobKey` resolves to the blob in IndexedDB;
`remoteStoragePath` when synced. `duration/sampleRate/channels` are captured at
decode time.

## Persistence boundary

| Source | Validation |
|---|---|
| IndexedDB load | `migrateProject` → `projectSchema` |
| Import (`.0wave.json`) | `migrateProject` → `projectSchema` |
| Supabase `state_json` | `migrateProject` → `projectSchema` |
| AI connector output (future) | per-group validation against `SynthState` parts |
