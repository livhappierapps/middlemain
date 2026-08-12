import { Router, type Request, type Response } from "express";
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../lib/logger";
import { loadRooms, saveRooms } from "../lib/roomStore";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Per-room map of agentKey → agent name for external bot participants. */
const roomAgentKeys = new Map<string, Map<string, string>>();

function getOrCreateAgentKeyMap(roomId: string): Map<string, string> {
  if (!roomAgentKeys.has(roomId)) roomAgentKeys.set(roomId, new Map());
  return roomAgentKeys.get(roomId)!;
}

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

interface ActiveStream {
  messageId: string;
  participantName?: string;
  participantColor?: string;
  timestamp: string;
  /** All content accumulated so far (buffered pre-start chunks + post-start chunks). */
  content: string;
  /**
   * True once streaming_start has been broadcast to existing clients.
   * Pre-start chunks are buffered and flushed on start; never broadcast before this.
   */
  started: boolean;
  /**
   * True once streaming_end has been processed. Acts as a tombstone so that
   * out-of-order post-end chunks cannot recreate the entry.
   */
  terminated: boolean;
}

interface Room {
  id: string;
  name: string;
  createdAt: string;
  messages: RoomMessage[];
  clients: Map<WebSocket, RoomClient>;
  /** In-memory only — never persisted. Keyed by messageId to support concurrent AI streams. */
  activeStreams: Map<string, ActiveStream>;
}

// ─── In-memory store (seeded from disk on startup) ───────────────────────────

const MAX_ROOM_MESSAGES = 200;
const rooms = new Map<string, Room>();

// Re-hydrate rooms from the persisted store. Clients and activeStreams start
// empty — WebSocket connections are re-established by clients after a restart.
for (const persisted of loadRooms()) {
  rooms.set(persisted.id, {
    ...persisted,
    clients: new Map(),
    activeStreams: new Map(),
  });
}

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
    activeStreams: new Map(),
  });
  saveRooms(rooms);
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

    saveRooms(rooms);
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

    const messageId = req.body?.messageId as string;
    const participantName = req.body?.participantName as string | undefined;
    const participantColor = req.body?.participantColor as string | undefined;
    const timestamp = (req.body?.timestamp as string) ?? new Date().toLocaleTimeString();

    const existing = room.activeStreams.get(messageId);
    // If already terminated (end raced before start), ignore entirely.
    if (existing?.terminated) { res.json({ ok: true }); return; }

    // Preserve content buffered by out-of-order pre-start chunks.
    const bufferedContent = existing?.content ?? "";

    room.activeStreams.set(messageId, {
      messageId, participantName, participantColor, timestamp,
      content: bufferedContent,
      started: true,
      terminated: false,
    });

    // Broadcast start to all existing connected clients.
    broadcast(room, { type: "streaming_start", messageId, participantName, participantColor, timestamp });

    // Flush any pre-start buffered chunks so existing clients don't miss them.
    if (bufferedContent) {
      broadcast(room, { type: "streaming_chunk", messageId, content: bufferedContent });
    }

    res.json({ ok: true });
  }
);

/** POST /api/council/rooms/:roomId/streaming/chunk — token chunk */
councilRoomRouter.post(
  "/council/rooms/:roomId/streaming/chunk",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }

    const chunk = (req.body?.content as string) ?? "";
    const chunkMsgId = req.body?.messageId as string;
    const entry = room.activeStreams.get(chunkMsgId);

    if (entry?.terminated) {
      // Post-end chunk due to race — discard; don't recreate a zombie entry.
      res.json({ ok: true }); return;
    }

    if (!entry) {
      // Chunk arrived before start — buffer it; do NOT broadcast yet.
      // start handler will flush buffered content to all clients when it arrives.
      room.activeStreams.set(chunkMsgId, {
        messageId: chunkMsgId,
        timestamp: new Date().toLocaleTimeString(),
        content: chunk,
        started: false,
        terminated: false,
      });
    } else if (!entry.started) {
      // Still waiting for start — keep accumulating, still don't broadcast.
      entry.content += chunk;
    } else {
      // Normal path: start already broadcast; accumulate and forward.
      entry.content += chunk;
      broadcast(room, { type: "streaming_chunk", messageId: chunkMsgId, content: chunk });
    }

    res.json({ ok: true });
  }
);

/** POST /api/council/rooms/:roomId/streaming/end — AI done streaming */
councilRoomRouter.post(
  "/council/rooms/:roomId/streaming/end",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }

    const messageId = req.body?.messageId as string;
    const entry = room.activeStreams.get(messageId);

    if (!entry) {
      // End arrived with no record — store a tombstone to block late post-end chunks.
      room.activeStreams.set(messageId, {
        messageId,
        timestamp: new Date().toLocaleTimeString(),
        content: "",
        started: false,
        terminated: true,
      });
    } else {
      entry.terminated = true;
    }

    // Only broadcast end if start was already sent; otherwise clients have no open bubble.
    if (entry?.started) {
      broadcast(room, { type: "streaming_end", messageId });
    }

    res.json({ ok: true });
  }
);

/**
 * POST /api/council/rooms/:roomId/agent
 *
 * Lets an external agent (e.g. a Replit agent) join a room under a chosen name
 * and post messages without needing a WebSocket connection.
 *
 * First call: omit agentKey → server mints one and returns it.
 * Subsequent calls: supply agentKey to authenticate.
 *
 * Body: { name: string, message: string, agentKey?: string }
 * Response: { ok: true, agentKey: string, agentName: string }
 */
councilRoomRouter.post(
  "/council/rooms/:roomId/agent",
  (req: Request, res: Response) => {
    const room = rooms.get(req.params.roomId as string);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }

    const name = ((req.body?.name as string) ?? "").trim();
    const content = ((req.body?.message as string) ?? "").trim();
    const suppliedKey = (req.body?.agentKey as string | undefined)?.trim();

    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!content) { res.status(400).json({ error: "message is required" }); return; }

    const keyMap = getOrCreateAgentKeyMap(req.params.roomId as string);

    let agentKey: string;

    if (suppliedKey) {
      // Verify the key matches the claimed name
      const registeredName = keyMap.get(suppliedKey);
      if (!registeredName) {
        res.status(401).json({ error: "Unknown agentKey — omit it to register a new agent" });
        return;
      }
      if (registeredName !== name) {
        res.status(403).json({ error: `agentKey belongs to "${registeredName}", not "${name}"` });
        return;
      }
      agentKey = suppliedKey;
    } else {
      // First call — mint a new key for this name (names can share a room; each gets a unique key)
      agentKey = genId() + genId();
      keyMap.set(agentKey, name);
      logger.info({ roomId: req.params.roomId, agentName: name }, "Agent registered");
    }

    // Build and store the message
    const msg: RoomMessage = {
      id: genId(),
      role: "ai",
      participantName: name,
      participantColor: "#00e5ff", // cyan — visually distinct from app participants
      content,
      timestamp: new Date().toLocaleTimeString(),
    };

    room.messages.push(msg);
    if (room.messages.length > MAX_ROOM_MESSAGES) {
      room.messages = room.messages.slice(-MAX_ROOM_MESSAGES);
    }
    saveRooms(rooms);
    broadcast(room, { type: "message", message: msg });

    logger.info({ roomId: req.params.roomId, agentName: name }, "Agent message posted");
    res.json({ ok: true, agentKey, agentName: name });
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
        participants: [...room.clients.values()].map((c) => c.name),
      })
    );

    // Replay every in-progress AI stream so late-joiners see the live typing bubble(s).
    // Only streams that have been started (start was broadcast to existing clients)
    // and not yet terminated are relevant; pre-start-buffered or ended entries are skipped.
    for (const stream of room.activeStreams.values()) {
      if (!stream.started || stream.terminated) continue;
      ws.send(JSON.stringify({
        type: "streaming_start",
        messageId: stream.messageId,
        participantName: stream.participantName,
        participantColor: stream.participantColor,
        timestamp: stream.timestamp,
      }));
      if (stream.content) {
        ws.send(JSON.stringify({
          type: "streaming_chunk",
          messageId: stream.messageId,
          content: stream.content,
        }));
      }
    }

    // Notify others
    broadcast(room, {
      type: "presence",
      participantCount: room.clients.size,
      participants: [...room.clients.values()].map((c) => c.name),
    }, ws);

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>;

        if (data.type === "join") {
          clientName = (data.name as string) || "Guest";
          room.clients.set(ws, { name: clientName, isApp: false });
          broadcast(room, {
            type: "join",
            name: clientName,
            participantCount: room.clients.size,
            participants: [...room.clients.values()].map((c) => c.name),
          }, ws);
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
          saveRooms(rooms);
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
        participants: [...room.clients.values()].map((c) => c.name),
      });
      logger.info({ roomId, name, remaining: room.clients.size }, "WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.warn({ roomId, err: err.message }, "WS client error");
    });
  });
}
