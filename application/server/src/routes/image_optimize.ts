import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { RequestHandler } from "express";
import sharp from "sharp";

import {
  MAX_ICON_WIDTH,
  WEBP_ICON_QUALITY,
} from "@web-speed-hackathon-2026/server/src/constants/imageOptimization";
import { MAX_MOVIE_WIDTH } from "@web-speed-hackathon-2026/server/src/constants/movieOptimization";

const execFileAsync = promisify(execFile);

const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 75;
// プロフィール画像・アイコンのパスパターン
const ICON_PATH_RE = /\/(profiles|icons)\//;
const MOVIE_PATH_RE = /^\/movies\//;

// 変換済み画像のインメモリキャッシュ
const cache = new Map<string, Buffer>();

interface OptimizedImage {
  contentType: string;
  data: Buffer;
}

async function getOptimizedImage(filePath: string, isIcon: boolean): Promise<OptimizedImage | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return null;

  const cacheKey = `${isIcon ? "icon" : "img"}:${filePath}`;
  if (cache.has(cacheKey)) {
    const data = cache.get(cacheKey)!;
    return {
      contentType: ext === ".webp" || isIcon ? "image/webp" : "image/jpeg",
      data,
    };
  }

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  try {
    if (ext === ".webp") {
      const original = await fs.readFile(filePath);
      cache.set(cacheKey, original);
      return { contentType: "image/webp", data: original };
    }

    const optimized = isIcon
      ? await sharp(filePath)
          .resize({ width: MAX_ICON_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_ICON_QUALITY })
          .toBuffer()
      : await sharp(filePath)
          .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
          .withMetadata()
          .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
          .toBuffer();

    cache.set(cacheKey, optimized);
    return {
      contentType: isIcon ? "image/webp" : "image/jpeg",
      data: optimized,
    };
  } catch {
    return null;
  }
}

async function getMoviePosterWebp(filePath: string): Promise<Buffer | null> {
  if (path.extname(filePath).toLowerCase() !== ".webp") return null;
  if (cache.has(filePath)) return cache.get(filePath)!;

  try {
    const existing = await fs.readFile(filePath);
    cache.set(filePath, existing);
    return existing;
  } catch {
    // 生成済みファイルなし
  }

  const mp4Path = filePath.replace(/\.webp$/i, ".mp4");
  try {
    await fs.access(mp4Path);
  } catch {
    return null;
  }

  try {
    await execFileAsync("ffmpeg", [
      "-i", mp4Path,
      "-vf", `select=eq(n\\,0),scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos`,
      "-frames:v", "1",
      "-y",
      filePath,
    ]);
    const generated = await fs.readFile(filePath);
    cache.set(filePath, generated);
    return generated;
  } catch {
    return null;
  }
}

async function getOptimizedGif(filePath: string): Promise<Buffer | null> {
  if (path.extname(filePath).toLowerCase() !== ".gif") return null;

  // ビルド時に事前変換された MP4 があれば ffmpeg なしでそのまま返す
  const mp4Path = filePath.replace(/\.gif$/i, ".mp4");
  if (cache.has(mp4Path)) return cache.get(mp4Path)!;
  try {
    await fs.access(mp4Path);
    const preConverted = await fs.readFile(mp4Path);
    cache.set(mp4Path, preConverted);
    return preConverted;
  } catch {
    // 事前変換済みファイルなし → ffmpeg フォールバック
  }

  if (cache.has(filePath)) return cache.get(filePath)!;

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const tmpOut = path.join(os.tmpdir(), `wsh-${Date.now()}-${path.basename(filePath, ".gif")}.mp4`);
  try {
    await execFileAsync("ffmpeg", [
      "-i", filePath,
      "-vf", `scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264",
      "-crf", "28",
      "-preset", "fast",
      "-movflags", "+faststart",
      "-an",
      "-y",
      tmpOut,
    ]);

    const optimized = await fs.readFile(tmpOut);
    cache.set(filePath, optimized);
    return optimized;
  } catch {
    return null;
  } finally {
    await fs.unlink(tmpOut).catch(() => {});
  }
}

export function createImageOptimizeMiddleware(basePaths: string[]): RequestHandler {
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const urlPath = req.path;
    const ext = path.extname(urlPath).toLowerCase();

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      if (ext === ".webp" && MOVIE_PATH_RE.test(urlPath)) {
        for (const base of basePaths) {
          const filePath = path.join(base, urlPath);
          const poster = await getMoviePosterWebp(filePath);
          if (poster == null) continue;

          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Content-Length", poster.length);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          req.method === "HEAD" ? res.end() : res.end(poster);
          return;
        }
      }

      const isIcon = ICON_PATH_RE.test(urlPath);
      for (const base of basePaths) {
        const filePath = path.join(base, urlPath);
        const optimized = await getOptimizedImage(filePath, isIcon);
        if (optimized == null) continue;

        res.setHeader("Content-Type", optimized.contentType);
        res.setHeader("Content-Length", optimized.data.length);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        req.method === "HEAD" ? res.end() : res.end(optimized.data);
        return;
      }
    }

    if (ext === ".gif") {
      for (const base of basePaths) {
        const filePath = path.join(base, urlPath);
        const optimized = await getOptimizedGif(filePath);
        if (optimized == null) continue;

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Length", optimized.length);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        req.method === "HEAD" ? res.end() : res.end(optimized);
        return;
      }
    }

    next();
  };
}
