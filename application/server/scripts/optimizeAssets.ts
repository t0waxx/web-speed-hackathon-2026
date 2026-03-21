/**
 * ローカル（Mac 等）で public アセットを軽量化してからデプロイするスクリプト
 * 使い方: make optimize-assets
 *
 * 事前条件: ffmpeg がインストール済み (brew install ffmpeg)
 * - GIF → MP4 変換（原本 .gif はそのまま保持）
 * - JPEG 圧縮（最大幅・品質を落として軽量化）
 * - プロフィール画像 JPEG 圧縮（幅は src/constants/imageOptimization.ts の MAX_ICON_WIDTH と一致）
 *
 * 変換済みの MP4 / 縮小済み JPEG は Docker イメージに含まれる。
 * 本番では image_optimize ミドルウェアも同じ上限で変換するが、ここで先に縮小しておくと
 * 起動直後の CPU と転送量を抑えやすい。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { MAX_ICON_WIDTH } from "../src/constants/imageOptimization";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const MOVIES_DIR = path.join(PUBLIC_DIR, "movies");
const IMAGES_DIR = path.join(PUBLIC_DIR, "images");
const PROFILES_DIR = path.join(IMAGES_DIR, "profiles");

const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 75;
const MAX_GIF_WIDTH = 480;

const FORCE = process.argv.includes("--force");

function fmtKB(bytes: number) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─── GIF → MP4 ────────────────────────────────────────────────────────────────

console.log("\n=== GIF → MP4 (原本 .gif は保持) ===");
const gifFiles = (await fs.readdir(MOVIES_DIR)).filter((f) => f.endsWith(".gif"));

for (const file of gifFiles) {
  const gifPath = path.join(MOVIES_DIR, file);
  const mp4Path = gifPath.replace(/\.gif$/, ".mp4");

  if (!FORCE) {
    try {
      await fs.access(mp4Path);
      console.log(`  skip (exists): ${file}`);
      continue;
    } catch {}
  }

  const gifStat = await fs.stat(gifPath);
  process.stdout.write(`  ${file} (${fmtKB(gifStat.size)}) → `);

  execFileSync(
    "ffmpeg",
    [
      "-i", gifPath,
      "-vf", `scale=${MAX_GIF_WIDTH}:-2:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264",
      "-crf", "28",
      "-preset", "fast",
      "-movflags", "+faststart",
      "-an",
      "-y",
      mp4Path,
    ],
    { stdio: "pipe" },
  );

  const mp4Stat = await fs.stat(mp4Path);
  const ratio = ((1 - mp4Stat.size / gifStat.size) * 100).toFixed(0);
  console.log(`${path.basename(mp4Path)} (${fmtKB(mp4Stat.size)}, -${ratio}%)`);
}

// ─── 通常画像 JPEG 圧縮 ────────────────────────────────────────────────────────

console.log("\n=== 通常画像 JPEG 圧縮 ===");
const imageFiles = (await fs.readdir(IMAGES_DIR)).filter((f) =>
  /\.(jpg|jpeg|png)$/i.test(f),
);

for (const file of imageFiles) {
  const srcPath = path.join(IMAGES_DIR, file);
  const dstPath = path.join(IMAGES_DIR, `${path.basename(file, path.extname(file))}.jpg`);

  const srcStat = await fs.stat(srcPath);
  process.stdout.write(`  ${file} (${fmtKB(srcStat.size)}) → `);

  const buf = await sharp(srcPath)
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
    .toBuffer();

  await fs.writeFile(dstPath, buf);
  const ratio = ((1 - buf.length / srcStat.size) * 100).toFixed(0);
  console.log(`${fmtKB(buf.length)} (-${ratio}%)`);
}

// ─── プロフィール画像 JPEG 圧縮 ───────────────────────────────────────────────

console.log("\n=== プロフィール画像 JPEG 圧縮 ===");
const profileFiles = (await fs.readdir(PROFILES_DIR)).filter((f) =>
  /\.(jpg|jpeg|png)$/i.test(f),
);

for (const file of profileFiles) {
  const srcPath = path.join(PROFILES_DIR, file);

  const srcStat = await fs.stat(srcPath);
  process.stdout.write(`  ${file} (${fmtKB(srcStat.size)}) → `);

  const buf = await sharp(srcPath)
    .resize({ width: MAX_ICON_WIDTH, withoutEnlargement: true })
    .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
    .toBuffer();

  await fs.writeFile(srcPath, buf);
  const ratio = ((1 - buf.length / srcStat.size) * 100).toFixed(0);
  console.log(`${fmtKB(buf.length)} (-${ratio}%)`);
}

console.log("\n=== 完了 ===");
console.log("次: make gcp-deploy でデプロイ");
