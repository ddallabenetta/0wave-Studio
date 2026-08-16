"use client";

/**
 * The transport, as four verbs.
 *
 * Both the transport bar and the space bar drive playback, and they have to
 * agree: one place decides what "play" means (engine call plus the UI
 * mirror), so a keyboard press and a button click can never leave the two
 * out of step.
 */
import { useCallback, useMemo } from "react";
import { useEngineRef } from "@/components/hooks/useEngine";
import { useUiStore } from "@/lib/state/ui-store";

export interface TransportControls {
  play(): void;
  pause(): void;
  /** Play when stopped or paused, pause when running. */
  toggle(): void;
  stop(): void;
  toStart(): void;
  /** False until the audio engine is running (nothing can sound yet). */
  ready: boolean;
}

export function useTransportControls(): TransportControls {
  const engineRef = useEngineRef();
  const audioStatus = useUiStore((s) => s.audioStatus);
  const ready = audioStatus === "running";

  const play = useCallback(() => {
    engineRef.current?.startTransport();
    useUiStore.getState().setTransportPlaying(true);
  }, [engineRef]);

  const pause = useCallback(() => {
    engineRef.current?.pauseTransport();
    useUiStore.getState().setTransportPlaying(false);
  }, [engineRef]);

  const toggle = useCallback(() => {
    if (useUiStore.getState().transportPlaying) pause();
    else play();
  }, [pause, play]);

  const stop = useCallback(() => {
    engineRef.current?.stopTransport();
    useUiStore.getState().setTransportPlaying(false);
  }, [engineRef]);

  const toStart = useCallback(() => {
    engineRef.current?.seek(0);
    useUiStore.getState().setPositionBeats(0);
  }, [engineRef]);

  return useMemo(
    () => ({ play, pause, toggle, stop, toStart, ready }),
    [play, pause, toggle, stop, toStart, ready],
  );
}
