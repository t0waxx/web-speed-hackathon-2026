import bcrypt from "bcrypt";
import { Router } from "express";
import httpErrors from "http-errors";

import { Post, User } from "@web-speed-hackathon-2026/server/src/models";
import { cacheGet, cacheInvalidatePrefix, cacheSet } from "@web-speed-hackathon-2026/server/src/utils/memory_cache";

export const userRouter = Router();

userRouter.get("/me", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }
  const key = `/me/${req.session.userId}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const user = await User.findByPk(req.session.userId);

  if (user === null) {
    throw new httpErrors.NotFound();
  }

  const body = JSON.stringify(user);
  cacheSet(key, body, 5_000);
  return res.status(200).type("application/json").send(body);
});

userRouter.put("/me", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }
  const user = await User.findByPk(req.session.userId);

  if (user === null) {
    throw new httpErrors.NotFound();
  }

  const body = { ...req.body };
  if (typeof body.password === "string") {
    body.password = await bcrypt.hash(body.password as string, 8);
  }
  Object.assign(user, body);
  await user.save();

  cacheInvalidatePrefix(`/users/${req.params.username}`);
  cacheInvalidatePrefix(`/me/${req.session.userId}`);
  return res.status(200).type("application/json").send(user);
});

userRouter.get("/users/:username", async (req, res) => {
  const key = `/users/${req.params.username}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const user = await User.findOne({
    where: {
      username: req.params.username,
    },
  });

  if (user === null) {
    throw new httpErrors.NotFound();
  }

  const body = JSON.stringify(user);
  cacheSet(key, body, 30_000);
  res.setHeader("Cache-Control", "public, s-maxage=30");
  return res.status(200).type("application/json").send(body);
});

userRouter.get("/users/:username/posts", async (req, res) => {
  const key = `/users/${req.params.username}/posts?limit=${req.query["limit"] ?? ""}&offset=${req.query["offset"] ?? ""}`;
  const cached = cacheGet(key);
  if (cached) return res.status(200).type("application/json").send(cached);

  const user = await User.findOne({
    where: {
      username: req.params.username,
    },
  });

  if (user === null) {
    throw new httpErrors.NotFound();
  }

  const posts = await Post.findAll({
    limit: req.query["limit"] != null ? Number(req.query["limit"]) : undefined,
    offset: req.query["offset"] != null ? Number(req.query["offset"]) : undefined,
    where: {
      userId: user.id,
    },
  });

  const body = JSON.stringify(posts);
  cacheSet(key, body, 10_000);
  res.setHeader("Cache-Control", "public, s-maxage=10");
  return res.status(200).type("application/json").send(body);
});
