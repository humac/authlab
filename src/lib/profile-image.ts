import { createHash } from "crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function mimeToSharpFormat(mime: string): "jpeg" | "png" | "webp" {
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/png") return "png";
  return "webp";
}

export function getMaxProfileImageBytes() {
  return MAX_IMAGE_BYTES;
}

export async function sanitizeProfileImage(buffer: Buffer) {
  if (buffer.length === 0) {
    throw new Error("Image file is required");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds 2MB limit");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new Error("Unsupported image type");
  }

  const format = mimeToSharpFormat(detected.mime);

  // Re-encode to strip EXIF metadata and normalize output.
  const normalized = await sharp(buffer)
    .rotate()
    .toFormat(format)
    .toBuffer();

  if (normalized.length > MAX_IMAGE_BYTES) {
    throw new Error("Processed image exceeds 2MB limit");
  }

  const sha256 = createHash("sha256").update(normalized).digest("hex");

  return {
    mimeType: detected.mime,
    content: normalized,
    sizeBytes: normalized.length,
    sha256,
  };
}
