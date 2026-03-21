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

// 変換した動画の拡張子
const EXTENSION = "gif";

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
  if (type === undefined || type.ext !== EXTENSION) {
    throw new httpErrors.BadRequest("Invalid file type");
  }

  const movieId = uuidv4();

  const gifPath = path.resolve(UPLOAD_PATH, `./movies/${movieId}.${EXTENSION}`);
  const mp4Path = path.resolve(UPLOAD_PATH, `./movies/${movieId}.mp4`);
  const webpPath = path.resolve(UPLOAD_PATH, `./movies/${movieId}.webp`);
  await fs.mkdir(path.resolve(UPLOAD_PATH, "movies"), { recursive: true });
  await fs.writeFile(gifPath, req.body);

  // 動画配信を高速化するため、投稿時に MP4 とポスター用 WebP を先に生成しておく。
  await execFileAsync("ffmpeg", [
    "-i", gifPath,
    "-vf", `scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264",
    "-crf", "28",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-an",
    "-y",
    mp4Path,
  ]);

  await execFileAsync("ffmpeg", [
    "-i", mp4Path,
    "-vf", `select=eq(n\\,0),scale=${MAX_MOVIE_WIDTH}:-2:flags=lanczos`,
    "-frames:v", "1",
    "-y",
    webpPath,
  ]);

  return res.status(200).type("application/json").send({ id: movieId });
});
