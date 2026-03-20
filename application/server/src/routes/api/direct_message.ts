import { Router } from "express";
import httpErrors from "http-errors";
import { Op, QueryTypes, literal } from "sequelize";

import { eventhub } from "@web-speed-hackathon-2026/server/src/eventhub";
import {
  DirectMessage,
  DirectMessageConversation,
  User,
} from "@web-speed-hackathon-2026/server/src/models";

export const directMessageRouter = Router();

directMessageRouter.get("/dm", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  // メッセージが存在する会話のみ取得（messages を全件ロードせずに EXISTS で絞り込む）
  const conversations = await DirectMessageConversation.findAll({
    where: {
      [Op.and]: [
        { [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }] },
        literal(
          `EXISTS (SELECT 1 FROM "DirectMessages" WHERE "conversationId" = "DirectMessageConversation"."id")`,
        ),
      ],
    },
  });

  if (conversations.length === 0) {
    return res.status(200).type("application/json").send([]);
  }

  const conversationIds = conversations.map((c) => c.id);

  // 各会話の最新メッセージIDを1クエリで取得
  const rawLatest = await DirectMessage.sequelize!.query<{ id: string }>(
    `SELECT dm.id
     FROM "DirectMessages" dm
     INNER JOIN (
       SELECT "conversationId", MAX("createdAt") AS "maxDate"
       FROM "DirectMessages"
       WHERE "conversationId" IN (${conversationIds.map(() => "?").join(",")})
       GROUP BY "conversationId"
     ) AS latest ON dm."conversationId" = latest."conversationId"
       AND dm."createdAt" = latest."maxDate"`,
    { replacements: conversationIds, type: QueryTypes.SELECT },
  );

  const latestMessageIds = rawLatest.map((r) => r.id);

  // sender情報付きで最新メッセージを取得
  const latestMessages = await DirectMessage.findAll({
    where: { id: { [Op.in]: latestMessageIds } },
    include: [{ association: "sender", include: [{ association: "profileImage" }] }],
  });

  // 未読メッセージがある会話IDを一括取得
  const unreadDms = await DirectMessage.findAll({
    attributes: ["conversationId"],
    where: {
      conversationId: { [Op.in]: conversationIds },
      senderId: { [Op.ne]: req.session.userId },
      isRead: false,
    },
    group: ["conversationId"],
  });
  const unreadConversationIds = new Set(unreadDms.map((dm) => dm.conversationId));

  // 最新メッセージ順にソートしてレスポンスを組み立てる
  const latestMessageByConversation = new Map(latestMessages.map((m) => [m.conversationId, m]));

  const sorted = conversations
    .filter((c) => latestMessageByConversation.has(c.id))
    .sort((a, b) => {
      const aTime = new Date(latestMessageByConversation.get(a.id)!.createdAt).getTime();
      const bTime = new Date(latestMessageByConversation.get(b.id)!.createdAt).getTime();
      return bTime - aTime;
    })
    .map((c) => ({
      ...c.toJSON(),
      latestMessage: latestMessageByConversation.get(c.id)?.toJSON() ?? null,
      hasUnread: unreadConversationIds.has(c.id),
    }));

  return res.status(200).type("application/json").send(sorted);
});

directMessageRouter.post("/dm", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const peer = await User.findByPk(req.body?.peerId);
  if (peer === null) {
    throw new httpErrors.NotFound();
  }

  const [conversation] = await DirectMessageConversation.findOrCreate({
    where: {
      [Op.or]: [
        { initiatorId: req.session.userId, memberId: peer.id },
        { initiatorId: peer.id, memberId: req.session.userId },
      ],
    },
    defaults: {
      initiatorId: req.session.userId,
      memberId: peer.id,
    },
  });
  await conversation.reload();

  return res.status(200).type("application/json").send(conversation);
});

directMessageRouter.ws("/dm/unread", async (req, _res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const handler = (payload: unknown) => {
    req.ws.send(JSON.stringify({ type: "dm:unread", payload }));
  };

  eventhub.on(`dm:unread/${req.session.userId}`, handler);
  req.ws.on("close", () => {
    eventhub.off(`dm:unread/${req.session.userId}`, handler);
  });

  const unreadCount = await DirectMessage.count({
    distinct: true,
    where: {
      senderId: { [Op.ne]: req.session.userId },
      isRead: false,
    },
    include: [
      {
        association: "conversation",
        where: {
          [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }],
        },
        required: true,
      },
    ],
  });

  eventhub.emit(`dm:unread/${req.session.userId}`, { unreadCount });
});

directMessageRouter.get("/dm/:conversationId", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  // DM詳細: 全メッセージを昇順で明示的に取得（separate: true で ORDER BY が確実に適用される）
  const conversation = await DirectMessageConversation.findOne({
    where: {
      id: req.params.conversationId,
      [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }],
    },
    include: [
      {
        association: "messages",
        include: [{ association: "sender", include: [{ association: "profileImage" }] }],
        required: false,
        separate: true,
        order: [["createdAt", "ASC"]],
      },
    ],
  });
  if (conversation === null) {
    throw new httpErrors.NotFound();
  }

  return res.status(200).type("application/json").send(conversation);
});

directMessageRouter.ws("/dm/:conversationId", async (req, _res) => {
  if (req.session.userId === undefined) {
    console.log(`[WS] /dm/:conversationId UNAUTHORIZED`);
    throw new httpErrors.Unauthorized();
  }

  console.log(`[WS] /dm/${req.params.conversationId} connected user=${req.session.userId?.slice(0,8)}`);

  const conversation = await DirectMessageConversation.findOne({
    where: {
      id: req.params.conversationId,
      [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }],
    },
  });
  if (conversation == null) {
    console.log(`[WS] /dm/${req.params.conversationId} conversation NOT FOUND`);
    throw new httpErrors.NotFound();
  }

  const peerId =
    conversation.initiatorId !== req.session.userId
      ? conversation.initiatorId
      : conversation.memberId;

  console.log(`[WS] /dm/${conversation.id?.slice(0,8)} registered events for user=${req.session.userId?.slice(0,8)} peer=${peerId?.slice(0,8)}`);

  const handleMessageUpdated = (payload: unknown) => {
    console.log(`[WS] sending dm:conversation:message to user=${req.session.userId?.slice(0,8)}`);
    req.ws.send(JSON.stringify({ type: "dm:conversation:message", payload }));
  };
  eventhub.on(`dm:conversation/${conversation.id}:message`, handleMessageUpdated);
  req.ws.on("close", () => {
    console.log(`[WS] /dm/${conversation.id?.slice(0,8)} closed for user=${req.session.userId?.slice(0,8)}`);
    eventhub.off(`dm:conversation/${conversation.id}:message`, handleMessageUpdated);
  });

  const handleTyping = (payload: unknown) => {
    req.ws.send(JSON.stringify({ type: "dm:conversation:typing", payload }));
  };
  eventhub.on(`dm:conversation/${conversation.id}:typing/${peerId}`, handleTyping);
  req.ws.on("close", () => {
    eventhub.off(`dm:conversation/${conversation.id}:typing/${peerId}`, handleTyping);
  });
});

directMessageRouter.post("/dm/:conversationId/messages", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const body: unknown = req.body?.body;
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new httpErrors.BadRequest();
  }

  const conversation = await DirectMessageConversation.findOne({
    where: {
      id: req.params.conversationId,
      [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }],
    },
  });
  if (conversation === null) {
    throw new httpErrors.NotFound();
  }

  const message = await DirectMessage.create({
    body: body.trim(),
    conversationId: conversation.id,
    senderId: req.session.userId,
  });
  await message.reload();

  return res.status(201).type("application/json").send(message);
});

directMessageRouter.post("/dm/:conversationId/read", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const conversation = await DirectMessageConversation.findOne({
    where: {
      id: req.params.conversationId,
      [Op.or]: [{ initiatorId: req.session.userId }, { memberId: req.session.userId }],
    },
  });
  if (conversation === null) {
    throw new httpErrors.NotFound();
  }

  const peerId =
    conversation.initiatorId !== req.session.userId
      ? conversation.initiatorId
      : conversation.memberId;

  const readStart = Date.now();
  const [affectedCount] = await DirectMessage.update(
    { isRead: true },
    {
      where: { conversationId: conversation.id, senderId: peerId, isRead: false },
      individualHooks: true,
    },
  );
  console.log(`[sendRead] convId=${conversation.id?.slice(0,8)} affected=${affectedCount} elapsed=${Date.now()-readStart}ms`);

  return res.status(200).type("application/json").send({});
});

directMessageRouter.post("/dm/:conversationId/typing", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }

  const conversation = await DirectMessageConversation.findByPk(req.params.conversationId);
  if (conversation === null) {
    throw new httpErrors.NotFound();
  }

  eventhub.emit(`dm:conversation/${conversation.id}:typing/${req.session.userId}`, {});

  return res.status(200).type("application/json").send({});
});
