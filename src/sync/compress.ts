import { compressImage } from '../vault/image';

/** Pictures are already ≤1500 px locally. Before they go to the server they are squeezed again so the free 1 GB lasts for thousands of questions. */
const TARGET = 200 * 1024;
const STEPS: Array<[number, number]> = [[1280, 0.72], [1100, 0.62], [960, 0.55], [800, 0.5]];

export async function compressForCloud(blob: Blob): Promise<Blob> {
  if (blob.size <= TARGET * 0.7 && blob.type === 'image/jpeg') return blob;
  let best = blob;
  for (const [max, q] of STEPS) {
    try {
      const out = await compressImage(blob, max, q);
      if (out.size < best.size || best === blob) best = out;
      if (out.size <= TARGET) break;
    } catch { break; }
  }
  return best;
}
