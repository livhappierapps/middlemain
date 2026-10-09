/**
 * Lightweight file-based persistence for council rooms.
 *
 * Only the serialisable parts of a room are persisted (id, name, createdAt,
 * messages). The WebSocket `clients` Map is rebuilt as an empty Map on load —
 * active connections are re-established by the clients themselves.
 */

import fs from "fs";
import path from "path";
import { logger } from "./logger";
import type { RoomMessage } from "../routes/councilRoom";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersistedRoom {
  id: string;
  name: string;
  createdAt: string;
  messages: RoomMessage[];
  /** SHA-256 digest only; the raw MCP token is returned once to the host device. */
  mcpTokenHash?: string | null;
}

// ─── Storage path ─────────────────────────────────────────────────────────────

// Resolve relative to the package root so the path works regardless of cwd.
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const STORE_PATH = path.join(DATA_DIR, "rooms.json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load all persisted rooms from disk. Returns an empty array on first run or parse error. */
export function loadRooms(): PersistedRoom[] {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      logger.info({ count: parsed.length, path: STORE_PATH }, "Loaded rooms from disk");
      return parsed as PersistedRoom[];
    }
    return [];
  } catch (err) {
    logger.warn({ err, path: STORE_PATH }, "Failed to parse room store — starting fresh");
    return [];
  }
}

/** Persist the current room list to disk. Silently swallows write errors. */
export function saveRooms(rooms: Map<string, { id: string; name: string; createdAt: string; messages: RoomMessage[]; mcpTokenHash?: string | null }>): void {
  ensureDataDir();
  const payload: PersistedRoom[] = [];
  for (const room of rooms.values()) {
    payload.push({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      messages: room.messages,
      mcpTokenHash: room.mcpTokenHash ?? null,
    });
  }
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, path: STORE_PATH }, "Failed to write room store");
  }
}
