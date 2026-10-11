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
import { workspaceRoot } from "./workspacePaths";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersistedRoom {
  id: string;
  name: string;
  createdAt: string;
  messages: RoomMessage[];
  /** SHA-256 digest only; the raw MCP token is returned once to the host device. */
  mcpTokenHash?: string | null;
  hostTokenHash?: string | null;
}

// ─── Storage path ─────────────────────────────────────────────────────────────

// Resolve relative to the package root so the path works regardless of cwd.
// The optional override lets local integration tests use an isolated room file.
const currentStore = path.join(workspaceRoot(), "artifacts", "api-server", "data", "rooms.json");
const legacyStore = path.join(workspaceRoot(), "artifacts", "data", "rooms.json");
const STORE_PATH = process.env.MIDDLEMAIN_ROOM_STORE_PATH
  ? path.resolve(process.env.MIDDLEMAIN_ROOM_STORE_PATH)
  : (!fs.existsSync(currentStore) && fs.existsSync(legacyStore) ? legacyStore : currentStore);
const DATA_DIR = path.dirname(STORE_PATH);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
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
    logger.error({ err, path: STORE_PATH }, "Invalid room store; refusing to overwrite existing history");
    throw new Error("Room storage is invalid. Repair or restore its backup before restarting.");
  }
}

/** Persist atomically, failing explicitly rather than claiming an unsaved update succeeded. */
export function saveRooms(rooms: Map<string, { id: string; name: string; createdAt: string; messages: RoomMessage[]; mcpTokenHash?: string | null; hostTokenHash?: string | null }>): void {
  ensureDataDir();
  const payload: PersistedRoom[] = [];
  for (const room of rooms.values()) {
    payload.push({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      messages: room.messages,
      mcpTokenHash: room.mcpTokenHash ?? null,
      hostTokenHash: room.hostTokenHash ?? null,
    });
  }
  try {
    const serialized = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(serialized) > 16 * 1024 * 1024) {
      throw new Error("Room storage capacity reached; operator archival is required.");
    }
    const temporaryPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, STORE_PATH);
  } catch (err) {
    logger.warn({ err, path: STORE_PATH }, "Failed to write room store");
    throw new Error("Room storage could not be saved");
  }
}
