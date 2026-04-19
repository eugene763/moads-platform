import {describe, expect, it} from "vitest";

import {parseIsoBmffDurationSeconds} from "./media.js";

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function box(type: string, content: Buffer): Buffer {
  return Buffer.concat([
    u32(8 + content.length),
    Buffer.from(type, "ascii"),
    content,
  ]);
}

function mvhdBox(timescale: number, duration: number): Buffer {
  return box("mvhd", Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.alloc(8),
    u32(timescale),
    u32(duration),
  ]));
}

describe("media duration parsing", () => {
  it("reads mvhd duration from a normal moov box", () => {
    const buffer = box("moov", mvhdBox(1000, 12500));

    expect(parseIsoBmffDurationSeconds(buffer)).toBe(12.5);
  });

  it("reads mvhd duration from a clipped tail range", () => {
    const buffer = Buffer.concat([
      Buffer.alloc(128),
      mvhdBox(1000, 7000),
      Buffer.alloc(128),
    ]);

    expect(parseIsoBmffDurationSeconds(buffer)).toBe(7);
  });
});
