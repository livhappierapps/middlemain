import { Router, type Request, type Response } from "express";
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoomMessage {
  id: string;
  role: "user" | "ai" | "system";
  participantName?: string;
  participantColor?: string;
  content: string;
  timestamp: string;
}

interface RoomClient {
  name: string;
  isApp: boolean;
}

interface Room {
  id: string;
  name: string;
  createdAt: string;
  messages: RoomMessage[];
  clients: Map<WebSocket, RoomClient>;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

const MAX_ROOM_MESSAGES = 200;
const rooms = new Map<string, Room>();

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function broadcast(room: Room, payload: unknown, exclude?: WebSocket): void {
  const data = JSON.stringify(payload);
  for (const [client] of room.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ─── REST router ─────────────────────────────────────────────────────────────

export const councilRoomRouter = Router();

/** POST /api/council/rooms — create a room */
councilRoomRouter.post("/council/rooms", (req: Request, res: Response) => {
  const id = genId();
  const name = (req.body?.name as string) || "Council Session";
  rooms.set(id, {
    id,
    name,
    createdAt: new Date().toISOString(),
    messages: [],
    clients: new Map(),
  });
  logger.info({ roomId: id }, "Council room created");
  res.json({ roomId: id, wsPath: `/api/council/ws/${id}` });
});

/** GET /api/council/rooms/:roomId — room info + history */
councilRoomRouter.get(
  "/council/rooms/:roomId",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      participantCount: room.clients.size,
      messages: room.messages,
    });
  }
);

/** POST /api/council/rooms/:roomId/messages — push a message from Middlemain */
councilRoomRouter.post(
  "/council/rooms/:roomId/messages",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const msg: RoomMessage = {
      id: (req.body?.id as string) || genId(),
      role: (req.body?.role as RoomMessage["role"]) ?? "user",
      participantName: req.body?.participantName,
      participantColor: req.body?.participantColor,
      content: (req.body?.content as string) ?? "",
      timestamp:
        (req.body?.timestamp as string) ?? new Date().toLocaleTimeString(),
    };

    room.messages.push(msg);
    if (room.messages.length > MAX_ROOM_MESSAGES) {
      room.messages = room.messages.slice(-MAX_ROOM_MESSAGES);
    }

    broadcast(room, { type: "message", message: msg });
    res.json({ ok: true });
  }
);

/** POST /api/council/rooms/:roomId/streaming/start — AI begins streaming */
councilRoomRouter.post(
  "/council/rooms/:roomId/streaming/start",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    broadcast(room, {
      type: "streaming_start",
      messageId: req.body?.messageId,
      participantName: req.body?.participantName,
      participantColor: req.body?.participantColor,
      timestamp: req.body?.timestamp ?? new Date().toLocaleTimeString(),
    });
    res.json({ ok: true });
  }
);

/** POST /api/council/rooms/:roomId/streaming/chunk — token chunk */
councilRoomRouter.post(
  "/council/rooms/:roomId/streaming/chunk",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    broadcast(room, {
      type: "streaming_chunk",
      messageId: req.body?.messageId,
      content: req.body?.content ?? "",
    });
    res.json({ ok: true });
  }
);

/** POST /api/council/rooms/:roomId/streaming/end — AI done streaming */
councilRoomRouter.post(
  "/council/rooms/:roomId/streaming/end",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    broadcast(room, {
      type: "streaming_end",
      messageId: req.body?.messageId,
    });
    res.json({ ok: true });
  }
);

// ─── WebSocket handler ───────────────────────────────────────────────────────

/**
 * Attach the council WebSocket server to the HTTP server.
 * Handles upgrade requests at /api/council/ws/:roomId
 */
export function attachCouncilWs(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (req.url?.startsWith("/api/council/ws/")) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    }
  );

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const match = req.url?.match(/\/api\/council\/ws\/([^/?]+)/);
    const roomId = match?.[1];

    if (!roomId) {
      ws.close(1008, "Missing room ID");
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      ws.close(1008, "Room not found");
      return;
    }

    let clientName = "Guest";
    room.clients.set(ws, { name: clientName, isApp: false });
    logger.info({ roomId, clientCount: room.clients.size }, "WS client connected");

    // Send full history on connect
    ws.send(
      JSON.stringify({
        type: "history",
        roomName: room.name,
        messages: room.messages,
        participantCount: room.clients.size,
      })
    );

    // Notify others
    broadcast(room, { type: "presence", participantCount: room.clients.size }, ws);

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (data.type === "join") {
          clientName = (data.name as string) || "Guest";
          room.clients.set(ws, { name: clientName, isApp: false });
          broadcast(room, { type: "join", name: clientName, participantCount: room.clients.size }, ws);
          logger.info({ roomId, name: clientName }, "Client joined room");
        }

        if (data.type === "message") {
          const content = ((data.content as string) ?? "").trim();
          if (!content) return;
          const msg: RoomMessage = {
            id: genId(),
            role: "user",
            participantName: room.clients.get(ws)?.name ?? "Guest",
            content,
            timestamp: new Date().toLocaleTimeString(),
          };
          room.messages.push(msg);
          if (room.messages.length > MAX_ROOM_MESSAGES) {
            room.messages = room.messages.slice(-MAX_ROOM_MESSAGES);
          }
          broadcast(room, { type: "message", message: msg });
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => {
      const name = room.clients.get(ws)?.name ?? "Guest";
      room.clients.delete(ws);
      broadcast(room, {
        type: "leave",
        name,
        participantCount: room.clients.size,
      });
      logger.info({ roomId, name, remaining: room.clients.size }, "WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.warn({ roomId, err: err.message }, "WS client error");
    });
  });
}
