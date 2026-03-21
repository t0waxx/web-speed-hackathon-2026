import { Router } from "express";
import httpErrors from "http-errors";

import { Comment, Post } from "@web-speed-hackathon-2026/server/src/models";
import { cacheGet, cacheInvalidatePrefix, cacheSet } from "@web-speed-hackathon-2026/server/src/utils/memory_cache";

export const postRouter = Router();

postRouter.get("/posts", async (req, res) => {
  const key = `/posts?limit=${req.query["limit"] ?? ""}&offset=${req.query["offset"] ?? ""}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const posts = await Post.findAll({
    limit: req.query["limit"] != null ? Number(req.query["limit"]) : undefined,
    offset: req.query["offset"] != null ? Number(req.query["offset"]) : undefined,
  });

  const body = JSON.stringify(posts);
  cacheSet(key, body, 10_000);
  res.setHeader("Cache-Control", "public, s-maxage=10");
  return res.status(200).type("application/json").send(body);
});

postRouter.get("/posts/:postId", async (req, res) => {
  const key = `/posts/${req.params.postId}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const post = await Post.findByPk(req.params.postId);

  if (post === null) {
    throw new httpErrors.NotFound();
  }

  const body = JSON.stringify(post);
  cacheSet(key, body, 30_000);
  res.setHeader("Cache-Control", "public, s-maxage=30");
  return res.status(200).type("application/json").send(body);
});

postRouter.get("/posts/:postId/comments", async (req, res) => {
  const key = `/posts/${req.params.postId}/comments?limit=${req.query["limit"] ?? ""}&offset=${req.query["offset"] ?? ""}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const posts = await Comment.findAll({
    limit: req.query["limit"] != null ? Number(req.query["limit"]) : undefined,
    offset: req.query["offset"] != null ? Number(req.query["offset"]) : undefined,
    where: {
      postId: req.params.postId,
    },
  });

  const body = JSON.stringify(posts);
  cacheSet(key, body, 10_000);
  res.setHeader("Cache-Control", "public, s-maxage=10");
  return res.status(200).type("application/json").send(body);
});

postRouter.post("/posts", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const post = await Post.create(
    {
      ...req.body,
      userId: req.session.userId,
    },
    {
      include: [
        {
          association: "images",
          through: { attributes: [] },
        },
        { association: "movie" },
        { association: "sound" },
      ],
    },
  );

  cacheInvalidatePrefix("/posts");
  return res.status(200).type("application/json").send(post);
});
