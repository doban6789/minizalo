import { imageSize } from 'image-size';
import { readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * imageMetadataGetter for zca-js — passed to `new Zalo({ imageMetadataGetter })`
 * (Red Team #8: it is a constructor option, not a per-send helper).
 */
export async function imageMetadataGetter(
  filePath: string,
): Promise<{ width: number; height: number; size: number } | null> {
  try {
    const buf = await readFile(filePath);
    const dim = imageSize(buf);
    const st = await stat(filePath);
    if (!dim.width || !dim.height) return null;
    return { width: dim.width, height: dim.height, size: st.size };
  } catch {
    return null;
  }
}

export interface ResolvedImage {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Resolve an image input to a filesystem path (zca-js AttachmentSource accepts a
 * path string). base64 is written to a temp file first (Red Team #8), then
 * cleaned up after send.
 */
export async function resolveImage(input: { imagePath?: string; imageBase64?: string }): Promise<ResolvedImage> {
  if (input.imagePath) {
    return { path: input.imagePath, cleanup: async () => {} };
  }
  if (input.imageBase64) {
    const b64 = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
    const dir = await mkdtemp(join(tmpdir(), 'minizalo-img-'));
    const path = join(dir, 'image.jpg');
    await writeFile(path, Buffer.from(b64, 'base64'));
    return { path, cleanup: async () => rm(dir, { recursive: true, force: true }) };
  }
  throw new Error('No image provided (imagePath or imageBase64 required).');
}
