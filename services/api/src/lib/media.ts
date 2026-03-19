import {createHash, randomUUID} from "node:crypto";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {ReadableStream as WebReadableStream} from "node:stream/web";

import type {Storage as FirebaseStorage} from "firebase-admin/storage";

import {PlatformError} from "@moads/db";

const MAX_INPUT_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_REFERENCE_VIDEO_BYTES = 101 * 1024 * 1024;
const PROBE_RANGE_BYTES = 2 * 1024 * 1024;
const REMOTE_PROBE_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_FETCH_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;

type Bucket = ReturnType<FirebaseStorage["bucket"]>;

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function buildDownloadUrl(bucketName: string, storagePath: string, downloadToken: string): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${encodeURIComponent(downloadToken)}`;
}

function isLikelyJpegBuffer(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function readUInt64BEAsNumber(buffer: Buffer, offset: number): number {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * 2 ** 32 + low;
}

function readIsoBox(
  buffer: Buffer,
  offset: number,
  limit = buffer.length,
): {
  type: string;
  size: number;
  headerSize: number;
  start: number;
  end: number;
  contentStart: number;
} | null {
  if (offset < 0 || offset + 8 > limit) {
    return null;
  }

  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > limit) {
      return null;
    }
    size = readUInt64BEAsNumber(buffer, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }

  if (type === "uuid") {
    if (offset + headerSize + 16 > limit) {
      return null;
    }
    headerSize += 16;
  }

  if (!Number.isFinite(size) || size < headerSize) {
    return null;
  }

  const end = offset + size;
  if (end > limit) {
    return null;
  }

  return {
    type,
    size,
    headerSize,
    start: offset,
    end,
    contentStart: offset + headerSize,
  };
}

function isLikelyIsoBmffVideoBuffer(buffer: Buffer): boolean {
  const box = readIsoBox(buffer, 0, buffer.length);
  if (!box || box.type !== "ftyp") {
    return false;
  }
  if (box.contentStart + 8 > box.end) {
    return false;
  }

  const brands: string[] = [];
  brands.push(buffer.toString("ascii", box.contentStart, box.contentStart + 4));
  for (let offset = box.contentStart + 8; offset + 4 <= box.end; offset += 4) {
    brands.push(buffer.toString("ascii", offset, offset + 4));
  }

  return brands.some((brand) => ["qt  ", "isom", "iso2", "avc1", "mp41", "mp42", "M4V ", "MSNV"].includes(brand));
}

function buildProbeRanges(totalBytes: number, windowBytes: number): Array<{start: number; end: number}> {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return [];
  }

  if (totalBytes <= windowBytes * 2) {
    return [{start: 0, end: Math.max(0, totalBytes - 1)}];
  }

  const headEnd = Math.max(0, Math.min(totalBytes - 1, windowBytes - 1));
  const tailStart = Math.max(0, totalBytes - windowBytes);
  const ranges = [{start: 0, end: headEnd}];

  if (tailStart > headEnd) {
    ranges.push({start: tailStart, end: totalBytes - 1});
  }

  return ranges;
}

async function streamToBuffer(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > maxBytes) {
      throw new PlatformError(400, "probe_too_large", "Video metadata chunk is too large to inspect.");
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks, totalBytes);
}

async function readStorageRangeBuffer(bucket: Bucket, storagePath: string, start: number, end: number): Promise<Buffer> {
  return await streamToBuffer(bucket.file(storagePath).createReadStream({start, end}), Math.max(1, end - start + 1));
}

function parseMvhdDurationSeconds(buffer: Buffer, boxStart: number, boxEnd: number): number | null {
  const box = readIsoBox(buffer, boxStart, boxEnd);
  if (!box || box.type !== "mvhd") {
    return null;
  }

  const versionOffset = box.contentStart;
  if (versionOffset + 4 > box.end) {
    return null;
  }

  const version = buffer.readUInt8(versionOffset);
  if (version === 0) {
    const timescaleOffset = versionOffset + 12;
    const durationOffset = versionOffset + 16;
    if (durationOffset + 4 > box.end) {
      return null;
    }
    const timescale = buffer.readUInt32BE(timescaleOffset);
    const duration = buffer.readUInt32BE(durationOffset);
    if (!timescale || !Number.isFinite(duration)) {
      return null;
    }
    return duration / timescale;
  }

  if (version === 1) {
    const timescaleOffset = versionOffset + 20;
    const durationOffset = versionOffset + 24;
    if (durationOffset + 8 > box.end) {
      return null;
    }
    const timescale = buffer.readUInt32BE(timescaleOffset);
    const duration = readUInt64BEAsNumber(buffer, durationOffset);
    if (!timescale || !Number.isFinite(duration)) {
      return null;
    }
    return duration / timescale;
  }

  return null;
}

function parseIsoBmffDurationSeconds(buffer: Buffer): number | null {
  for (let offset = 0; offset < buffer.length;) {
    const box = readIsoBox(buffer, offset, buffer.length);
    if (!box) {
      break;
    }

    if (box.type === "moov") {
      for (let innerOffset = box.contentStart; innerOffset < box.end;) {
        const innerBox = readIsoBox(buffer, innerOffset, box.end);
        if (!innerBox) {
          break;
        }
        if (innerBox.type === "mvhd") {
          return parseMvhdDurationSeconds(buffer, innerOffset, box.end);
        }
        innerOffset = innerBox.end;
      }
    }

    offset = box.end;
  }

  return null;
}

export async function storageObjectExists(bucket: Bucket, storagePath: string): Promise<boolean> {
  const [exists] = await bucket.file(storagePath).exists();
  return exists === true;
}

export async function ensureStorageDownloadUrl(
  bucket: Bucket,
  bucketName: string,
  storagePath: string,
): Promise<{downloadUrl: string; downloadToken: string}> {
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const existingTokensRaw = pickString(metadata.metadata?.firebaseStorageDownloadTokens);
  let downloadToken = "";
  if (existingTokensRaw) {
    downloadToken = existingTokensRaw.split(",").map((item) => item.trim()).find(Boolean) ?? "";
  }

  if (!downloadToken) {
    downloadToken = randomUUID();
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata ?? {}),
        firebaseStorageDownloadTokens: downloadToken,
      },
    });
  }

  return {
    downloadToken,
    downloadUrl: buildDownloadUrl(bucketName, storagePath, downloadToken),
  };
}

export async function assertUploadedPhotoIsValid(bucket: Bucket, storagePath: string): Promise<void> {
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const size = Number(metadata.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new PlatformError(400, "photo_empty", "Uploaded photo is empty.");
  }
  if (size > MAX_INPUT_IMAGE_BYTES) {
    throw new PlatformError(400, "photo_too_large", "Uploaded photo exceeds the 40 MB upload limit.");
  }

  const sniffBuffer = await readStorageRangeBuffer(bucket, storagePath, 0, 31);
  if (!isLikelyJpegBuffer(sniffBuffer)) {
    throw new PlatformError(400, "photo_invalid_format", "Uploaded photo must be a JPEG image.");
  }
}

export async function assertUploadedReferenceVideoIsValid(bucket: Bucket, storagePath: string): Promise<number> {
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const size = Number(metadata.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new PlatformError(400, "reference_video_empty", "Uploaded reference video is empty.");
  }
  if (size > MAX_REFERENCE_VIDEO_BYTES) {
    throw new PlatformError(400, "reference_video_too_large", "Reference video exceeds the 101 MB upload limit.");
  }

  const ranges = buildProbeRanges(size, PROBE_RANGE_BYTES);
  let checkedHead = false;

  for (const range of ranges) {
    const buffer = await readStorageRangeBuffer(bucket, storagePath, range.start, range.end);
    if (!checkedHead) {
      checkedHead = true;
      if (!isLikelyIsoBmffVideoBuffer(buffer)) {
        throw new PlatformError(400, "reference_video_invalid_format", "Please upload an MP4 or MOV reference video.");
      }
    }

    const durationSec = parseIsoBmffDurationSeconds(buffer);
    if (durationSec && Number.isFinite(durationSec) && durationSec > 0) {
      return durationSec;
    }
  }

  throw new PlatformError(400, "reference_video_probe_failed", "Unable to read reference video duration.");
}

function parseTotalBytesFromHeaders(headers: Headers): number | null {
  const contentRange = pickString(headers.get("content-range"));
  if (contentRange) {
    const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+|\*)/i);
    if (match && match[1] !== "*") {
      const total = Number(match[1]);
      if (Number.isFinite(total) && total > 0) {
        return total;
      }
    }
  }

  const contentLength = Number(headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength;
  }

  return null;
}

async function readRemoteRangeBuffer(sourceUrl: string, start: number, end: number, maxBytes: number): Promise<{buffer: Buffer; totalBytes: number | null}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        Range: `bytes=${start}-${end}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PlatformError(502, "remote_fetch_failed", `Remote video fetch failed with ${response.status}.`);
    }

    const totalBytes = parseTotalBytesFromHeaders(response.headers);
    if (totalBytes !== null && totalBytes > MAX_DOWNLOAD_BYTES) {
      throw new PlatformError(400, "remote_video_too_large", "Generated video is too large to inspect.");
    }

    if (!response.body) {
      throw new PlatformError(502, "remote_fetch_empty", "Remote video fetch returned an empty body.");
    }

    const buffer = await streamToBuffer(Readable.fromWeb(response.body as unknown as WebReadableStream), maxBytes);
    return {buffer, totalBytes};
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeRemoteVideoDurationSeconds(sourceUrl: string): Promise<number> {
  const headRange = await readRemoteRangeBuffer(sourceUrl, 0, REMOTE_PROBE_BYTES - 1, REMOTE_PROBE_BYTES);
  if (!isLikelyIsoBmffVideoBuffer(headRange.buffer)) {
    throw new PlatformError(400, "generated_video_invalid_format", "Unable to read generated video duration.");
  }

  const headDuration = parseIsoBmffDurationSeconds(headRange.buffer);
  if (headDuration && Number.isFinite(headDuration) && headDuration > 0) {
    return headDuration;
  }

  const totalBytes = headRange.totalBytes;
  if (totalBytes && totalBytes > REMOTE_PROBE_BYTES) {
    const tailStart = Math.max(0, totalBytes - REMOTE_PROBE_BYTES);
    if (tailStart > 0) {
      const tailRange = await readRemoteRangeBuffer(sourceUrl, tailStart, totalBytes - 1, REMOTE_PROBE_BYTES);
      const tailDuration = parseIsoBmffDurationSeconds(tailRange.buffer);
      if (tailDuration && Number.isFinite(tailDuration) && tailDuration > 0) {
        return tailDuration;
      }
    }
  }

  throw new PlatformError(400, "generated_video_probe_failed", "Unable to read generated video duration.");
}

async function cloneStoredVideoToDownloadObject(params: {
  bucket: Bucket;
  sourceStoragePath: string;
  targetStoragePath: string;
  fileName: string;
  downloadToken: string;
  contentType: string;
}): Promise<void> {
  const sourceFile = params.bucket.file(params.sourceStoragePath);
  const targetFile = params.bucket.file(params.targetStoragePath);
  const writeStream = targetFile.createWriteStream({
    resumable: false,
    metadata: {
      contentType: params.contentType,
      contentDisposition: `attachment; filename="${params.fileName}"`,
      cacheControl: "private, max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: params.downloadToken,
      },
    },
  });

  try {
    await pipeline(sourceFile.createReadStream(), writeStream);
  } catch (error) {
    await targetFile.delete({ignoreNotFound: true});
    throw error;
  }
}

export async function prepareDownloadArtifacts(params: {
  bucket: Bucket;
  bucketName: string;
  sourceUrl: string;
  uidSegment: string;
  jobId: string;
  fileName?: string;
}): Promise<{
  inline: {
    storagePath: string;
    downloadToken: string;
    downloadUrl: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  };
  download: {
    storagePath: string;
    downloadToken: string;
    downloadUrl: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  };
}> {
  const fileName = params.fileName ?? `${params.jobId}.mp4`;
  const inlineStoragePath = `outputs/${params.uidSegment}/${params.jobId}/result.mp4`;
  const downloadStoragePath = `outputs/${params.uidSegment}/${params.jobId}/result-download.mp4`;
  const inlineToken = randomUUID();
  const downloadToken = randomUUID();
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_MS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_FETCH_TIMEOUT_MS);

  const targetFile = params.bucket.file(inlineStoragePath);
  let sizeBytes = 0;

  try {
    const response = await fetch(params.sourceUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new PlatformError(502, "download_fetch_failed", `Failed to fetch generated video (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "video/mp4";
    const writeStream = targetFile.createWriteStream({
      resumable: false,
      metadata: {
        contentType,
        contentDisposition: `inline; filename="${fileName}"`,
        cacheControl: "private, max-age=3600",
        metadata: {
          firebaseStorageDownloadTokens: inlineToken,
        },
      },
    });

    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream),
      new Transform({
        transform(chunk, _encoding, callback) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          sizeBytes += buffer.length;
          callback(null, buffer);
        },
      }),
      writeStream,
    );

    await cloneStoredVideoToDownloadObject({
      bucket: params.bucket,
      sourceStoragePath: inlineStoragePath,
      targetStoragePath: downloadStoragePath,
      fileName,
      downloadToken,
      contentType,
    });

    return {
      inline: {
        storagePath: inlineStoragePath,
        downloadToken: inlineToken,
        downloadUrl: buildDownloadUrl(params.bucketName, inlineStoragePath, inlineToken),
        fileName,
        contentType,
        sizeBytes,
        expiresAt,
      },
      download: {
        storagePath: downloadStoragePath,
        downloadToken,
        downloadUrl: buildDownloadUrl(params.bucketName, downloadStoragePath, downloadToken),
        fileName,
        contentType,
        sizeBytes,
        expiresAt,
      },
    };
  } catch (error) {
    await params.bucket.file(inlineStoragePath).delete({ignoreNotFound: true});
    await params.bucket.file(downloadStoragePath).delete({ignoreNotFound: true});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
