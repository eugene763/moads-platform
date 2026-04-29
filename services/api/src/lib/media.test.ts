import {Readable} from "node:stream";

import {describe, expect, it} from "vitest";

import {
  assertUploadedReferenceVideoIsValid,
  parseIsoBmffDurationSeconds,
} from "./media.js";

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

function ftypBox(): Buffer {
  return box("ftyp", Buffer.concat([
    Buffer.from("qt  ", "ascii"),
    u32(0),
    Buffer.from("qt  ", "ascii"),
  ]));
}

function fakeBucketForBuffer(buffer: Buffer) {
  return {
    file: () => ({
      getMetadata: async () => [{size: String(buffer.length)}],
      createReadStream: ({start = 0, end = buffer.length - 1}: {start?: number; end?: number} = {}) => {
        return Readable.from([buffer.subarray(start, Math.min(end + 1, buffer.length))]);
      },
    }),
  };
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

  it("accepts an otherwise valid reference video when duration metadata is unavailable", async () => {
    const buffer = Buffer.concat([
      ftypBox(),
      box("mdat", Buffer.alloc(128)),
    ]);

    await expect(
      assertUploadedReferenceVideoIsValid(fakeBucketForBuffer(buffer) as never, "reference.mov"),
    ).resolves.toBeNull();
  });
});
