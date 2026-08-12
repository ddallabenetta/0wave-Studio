"use client";

/**
 * Decoded AudioBuffer cache for sample sounds.
 *
 * Blobs live in IndexedDB; decoding is expensive, so each asset is decoded
 * once per session and shared by the library preview, the sample editor
 * waveform, and Playground playback.
 */
import { localRepository } from "@/lib/persistence/local";
import type { IAudioEngine } from "@/lib/audio/api";
import type { AudioAsset, ID } from "@/lib/schema/types";

const cache = new Map<ID, AudioBuffer>();
const inFlight = new Map<ID, Promise<AudioBuffer | null>>();

export function getCachedBuffer(assetId: ID): AudioBuffer | undefined {
  return cache.get(assetId);
}

export async function loadSampleBuffer(
  engine: IAudioEngine,
  asset: AudioAsset,
): Promise<AudioBuffer | null> {
  const cached = cache.get(asset.id);
  if (cached) return cached;

  const pending = inFlight.get(asset.id);
  if (pending) return pending;

  const task = (async () => {
    try {
      const blob = await localRepository.loadBlob(asset.localBlobKey);
      if (!blob) return null;
      const buffer = await engine.decodeAudio(await blob.arrayBuffer());
      cache.set(asset.id, buffer);
      return buffer;
    } catch {
      return null;
    } finally {
      inFlight.delete(asset.id);
    }
  })();

  inFlight.set(asset.id, task);
  return task;
}

/** Register a freshly decoded buffer (recording / import) without a round trip. */
export function primeSampleBuffer(assetId: ID, buffer: AudioBuffer): void {
  cache.set(assetId, buffer);
}

export function dropSampleBuffer(assetId: ID): void {
  cache.delete(assetId);
}
