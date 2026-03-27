/**
 * Generate PWA icons with correct padding and no baked-in rounded corners.
 *
 * Usage: bun run scripts/generate-icons.ts
 *
 * Reads pwa-512x512-source.png (the original logo with baked-in rounded
 * corners), extracts the clapperboard by scanning for non-dark pixels,
 * and composites it onto new canvases with proper padding.
 *
 * The source file is kept separate so re-runs are idempotent.
 */
import sharp from "sharp";
import path from "path";

const PUBLIC_DIR = path.resolve(import.meta.dir, "../frontend/public");
const BG_COLOR = { r: 15, g: 22, b: 40, alpha: 1 };
const BG_HEX = "#0f1628";

interface IconSpec {
  filename: string;
  size: number;
  /** Padding as fraction of icon size (0-1) */
  paddingFraction: number;
}

const icons: IconSpec[] = [
  { filename: "pwa-512x512.png", size: 512, paddingFraction: 0.15 },
  { filename: "pwa-maskable-512x512.png", size: 512, paddingFraction: 0.22 },
  { filename: "pwa-192x192.png", size: 192, paddingFraction: 0.15 },
  { filename: "apple-touch-icon.png", size: 180, paddingFraction: 0.15 },
  { filename: "favicon.png", size: 64, paddingFraction: 0.06 },
];

/** Brightness threshold to distinguish logo from dark background */
const BRIGHTNESS_THRESHOLD = 40;

async function extractLogoBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) {
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness > BRIGHTNESS_THRESHOLD) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

async function main() {
  const sourcePath = path.join(PUBLIC_DIR, "pwa-512x512-source.png");

  // Get raw pixel data to find the logo bounds
  const { data, info } = await sharp(sourcePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = await extractLogoBounds(
    data,
    info.width,
    info.height,
    info.channels,
  );

  const logoWidth = bounds.maxX - bounds.minX + 1;
  const logoHeight = bounds.maxY - bounds.minY + 1;
  console.log(
    `Logo bounds: (${bounds.minX},${bounds.minY}) to (${bounds.maxX},${bounds.maxY})`,
  );
  console.log(`Logo size: ${logoWidth}x${logoHeight}`);

  // Extract just the logo region from the source
  const logoBuffer = await sharp(sourcePath)
    .extract({
      left: bounds.minX,
      top: bounds.minY,
      width: logoWidth,
      height: logoHeight,
    })
    .toBuffer();

  for (const spec of icons) {
    const padding = Math.round(spec.size * spec.paddingFraction);
    const availableSize = spec.size - padding * 2;

    // Resize logo to fit within available area, maintaining aspect ratio
    const resizedLogo = await sharp(logoBuffer)
      .resize(availableSize, availableSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    // Create the final icon: solid background + centered logo
    await sharp({
      create: {
        width: spec.size,
        height: spec.size,
        channels: 4,
        background: BG_COLOR,
      },
    })
      .composite([{ input: resizedLogo, left: padding, top: padding }])
      .png()
      .toFile(path.join(PUBLIC_DIR, spec.filename));

    console.log(
      `Generated ${spec.filename} (${spec.size}x${spec.size}, padding=${padding}px)`,
    );
  }

  console.log("\nDone! All icons generated in frontend/public/");
}

main().catch((err) => {
  console.error("Failed to generate icons:", err);
  process.exit(1);
});
