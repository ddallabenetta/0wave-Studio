"use client";

/**
 * Turns a recorded or imported audio blob into a persisted AudioAsset plus a
 * SampleSound. The original blob is stored untouched; all editing afterwards
 * is non-destructive parameter data on the SampleState.
 */
import { createId, defaultAdsr, defaultEffects } from "@/lib/schema/factories";
import { localRepository } from "@/lib/persistence/local";
import { useProjectStore } from "@/lib/state/project-store";
import { primeSampleBuffer } from "./sampleBuffers";
import type { IAudioEngine } from "@/lib/audio/api";
import type { AssetSource, AudioAsset, SoundDefinition } from "@/lib/schema/types";

export interface DecodedUpload {
  buffer: AudioBuffer;
  blob: Blob;
  filename: string;
  mimeType: string;
}

export async function decodeUpload(
  engine: IAudioEngine,
  blob: Blob,
  filename: string,
): Promise<DecodedUpload> {
  const buffer = await engine.decodeAudio(await blob.arrayBuffer());
  return { buffer, blob, filename, mimeType: blob.type || "audio/wav" };
}

/**
 * Persists the blob, registers the asset and the sample sound in the project,
 * and primes the decoded buffer cache. Returns the created sound.
 */
export async function saveSampleSound(
  upload: DecodedUpload,
  source: AssetSource,
  name: string,
): Promise<SoundDefinition> {
  const assetId = createId();
  const localBlobKey = `asset-${assetId}`;
  const now = new Date().toISOString();

  const asset: AudioAsset = {
    id: assetId,
    source,
    originalFilename: upload.filename,
    mimeType: upload.mimeType,
    duration: upload.buffer.duration,
    sampleRate: upload.buffer.sampleRate,
    channels: Math.min(2, upload.buffer.numberOfChannels),
    localBlobKey,
    createdAt: now,
    updatedAt: now,
  };

  await localRepository.saveBlob({ key: localBlobKey, data: upload.blob, mimeType: upload.mimeType });
  primeSampleBuffer(assetId, upload.buffer);

  const sound: SoundDefinition = {
    id: createId(),
    type: "sample",
    name,
    metadata: { origin: source === "recording" ? "recording" : "import", tags: [], syncState: "local" },
    createdAt: now,
    updatedAt: now,
    sampleState: {
      assetId,
      trimStart: 0,
      trimEnd: upload.buffer.duration,
      fadeIn: 0,
      fadeOut: 0,
      gain: 1,
      reversed: false,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: upload.buffer.duration,
      playbackMode: "one-shot",
      rootNote: 60,
      tuningCents: 0,
      ampEnvelope: defaultAdsr(),
      filter: { mode: "lowpass", cutoff: 20000, resonance: 0.7 },
      effects: defaultEffects(),
    },
  };

  const store = useProjectStore.getState();
  store.addAsset(asset);
  store.addSound(sound);
  return sound;
}
