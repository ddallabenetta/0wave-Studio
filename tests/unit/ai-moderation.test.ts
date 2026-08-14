import { describe, expect, it } from "vitest";
import { moderatePrompt, AI_PROMPT_MAX_LENGTH } from "@/lib/ai/moderation";

describe("moderatePrompt", () => {
  it("allows a normal synth description", () => {
    expect(moderatePrompt("a short round bass, slightly acid, fast attack")).toEqual({
      allowed: true,
    });
  });

  it("rejects a prompt above the length cap", () => {
    const result = moderatePrompt("x".repeat(AI_PROMPT_MAX_LENGTH + 1));
    expect(result).toEqual({ allowed: false, reason: "too-long" });
  });

  it("allows a prompt exactly at the length cap", () => {
    expect(moderatePrompt("x".repeat(AI_PROMPT_MAX_LENGTH)).allowed).toBe(true);
  });

  it("rejects blocklisted terms case-insensitively", () => {
    expect(moderatePrompt("make a bomb sound").allowed).toBe(false);
    expect(moderatePrompt("SUICIDE bassline").allowed).toBe(false);
  });

  it("does not reject terms merely containing a blocklist word", () => {
    // "bombastic" is not "bomb" — substring matching stays intentional.
    expect(moderatePrompt("a bombastic brass stab").allowed).toBe(true);
  });
});
