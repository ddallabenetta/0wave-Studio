/**
 * Shared tactile control library for Studio and Playground.
 *
 * These are the only interactive controls the creative surfaces use. Every
 * control is keyboard-operable, exposes real ARIA semantics, and follows the
 * design tokens in globals.css.
 */
export { Knob } from "./Knob";
export type { KnobProps } from "./Knob";

export { Fader } from "./Fader";
export type { FaderProps } from "./Fader";

export { Toggle } from "./Toggle";
export type { ToggleProps, LedState } from "./Toggle";

export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedOption } from "./SegmentedControl";

export { Button, Spinner } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { Display } from "./Display";
export type { DisplayProps } from "./Display";

export { LedMeter } from "./LedMeter";
export type { LedMeterProps } from "./LedMeter";

// Shared interaction primitives, reused across the controls above.
export {
  useDragSession,
  useValueKeyboard,
  normalizedToValue,
  valueToNormalized,
  snapValue,
  DRAG_PIXELS,
} from "./useDrag";
export type { DragOptions, KeyboardOptions, DragSession } from "./useDrag";
