import { execFile } from "node:child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "node:util";

import { Router } from "express";
import { fileTypeFromBuffer } from "file-type";
import httpErrors from "http-errors";
import { v4 as uuidv4 } from "uuid";

import { MAX_MOVIE_WIDTH } from "@web-speed-hackathon-2026/server/src/constants/movieOptimization";
import { UPLOAD_PATH } from "@web-speed-hackathon-2026/server/src/paths";

// 受け付ける動画の MIME タイプ
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/x-matroska", "video/quicktime", "video/x-msvideo", "video/mpeg"]);

export const movieRouter = Router();
const execFileAsync = promisify(execFile);

movieRouter.post("/movies", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }
  if (Buffer.isBuffer(req.body) === false) {
    throw new httpErrors.BadRequest();
  }

  const type = await fileTypeFromBuffer(req.body);
  const isVideo = type != null && (VIDEO_MIME_TYPES.has(type.mime) || type.mime.startsWith("video/"));
  const isGif = type?.ext === "gif";
  if (!isVideo && !isGif) {
    throw new httpErrors.BadRequest("Invalid file type");
  }

  const movieId = uuidv4();

  const inputExt = type!.ext;
  const inputPath = path.resolve(UPLOAD_PATH, `./movies/${movieId}.${inputExt}`);
  const mp4Path = path.resolve(UPLOAD_PATH, `./movies/${movieId}.mp4`);
  const webpPath = path.resolve(UPLOAD_PATH, `./movies/${movieId}.webp`);
  await fs.mkdir(path.resolve(UPLOAD_PATH, "movies"), { recursive: true });
  await fs.writeFile(inputPath, req.body);

  // 動画配信を高速化するため、投稿時に MP4 とポスター用 WebP を先に生成しておく。
  // 生動画の場合は先頭5秒・10fps・正方形クロップも適用する。
  const vfFilter = isGif
    ? `scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos,format=yuv420p`
    : `crop='min(iw,ih)':'min(iw,ih)',scale=${MAX_MOVIE_WIDTH}:${MAX_MOVIE_WIDTH}:flags=lanczos,format=yuv420p`;

  const ffmpegArgs = isGif
    ? ["-i", inputPath, "-vf", vfFilter, "-c:v", "libx264", "-crf", "28", "-preset", "fast", "-movflags", "+faststart", "-an", "-y", mp4Path]
    : ["-i", inputPath, "-t", "5", "-r", "10", "-vf", vfFilter, "-c:v", "libx264", "-crf", "28", "-preset", "fast", "-movflags", "+faststart", "-an", "-y", mp4Path];

  await execFileAsync("ffmpeg", ffmpegArgs);

  await execFileAsync("ffmpeg", [
    "-i", mp4Path,
    "-vf", `select=eq(n\\,0),scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos`,
    "-frames:v", "1",
    "-y",
    webpPath,
  ]);

  return res.status(200).type("application/json").send({ id: movieId });
});
