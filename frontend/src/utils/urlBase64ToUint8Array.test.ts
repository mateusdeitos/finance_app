import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./urlBase64ToUint8Array";

describe("urlBase64ToUint8Array", () => {
  it("decodes a known base64url string to the expected byte sequence", () => {
    // "hello" in base64url (no padding) → bytes [104,101,108,108,111]
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles base64url with padding already present", () => {
    // "hello" in standard base64 (with padding)
    const result = urlBase64ToUint8Array("aGVsbG8=");
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("translates '-' to '+' and '_' to '/' before decoding", () => {
    // base64url uses - and _ instead of + and /
    // Byte 0xfb = 251 encodes as '+w==' in standard base64, '-w==' in base64url
    const result = urlBase64ToUint8Array("-w");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0xfb);
  });

  it("handles missing padding for lengths not divisible by 4", () => {
    // "Man" → base64url "TWFu" (length 4, no padding needed)
    // "Ma" → base64url "TWE" (length 3, 1 padding needed)
    const result = urlBase64ToUint8Array("TWE");
    expect(Array.from(result)).toEqual([77, 97]); // 'M', 'a'
  });

  it("decodes a realistic VAPID public key length string without error", () => {
    // 65-byte uncompressed EC P-256 point encoded as base64url (87 chars without padding).
    // Test vector: 0x04 prefix byte + bytes 1..64 (deterministic, not a real key).
    const vapidKey =
      "BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-P0A";
    const result = urlBase64ToUint8Array(vapidKey);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
  });
});
