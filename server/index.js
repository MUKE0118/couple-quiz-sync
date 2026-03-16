import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * Room state lives in memory (simple + cheap).
 * For production persistence, swap to Redis/DB.
 */
const rooms = new Map(); // roomCode -> { a, b, submittedA, submittedB, nicknameA, nicknameB, updatedAt }

function now() {
  return Date.now();
}

function normalizeRoom(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function getRoom(code) {
  const c = normalizeRoom(code);
  if (!c) return null;
  if (!rooms.has(c)) {
    rooms.set(c, { a: {}, b: {}, submittedA: false, submittedB: false, nicknameA: "", nicknameB: "", updatedAt: now() });
  }
  return { code: c, state: rooms.get(c) };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function send(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function broadcast(roomCode, msg) {
  for (const client of wss.clients) {
    if (client.readyState !== client.OPEN) continue;
    if (client._roomCode !== roomCode) continue;
    send(client, msg);
  }
}

function roleForJoin(preferred, roomState, taken) {
  if (preferred === "a" || preferred === "b") {
    if (!taken.has(preferred)) return preferred;
  }
  if (!taken.has("a")) return "a";
  if (!taken.has("b")) return "b";
  return "spectator";
}

wss.on("connection", (ws) => {
  ws._roomCode = null;
  ws._role = null;

  send(ws, { type: "hello", version: 1 });

  ws.on("message", (buf) => {
    const msg = safeParse(String(buf || ""));
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "join") {
      const roomCode = normalizeRoom(msg.room);
      const room = getRoom(roomCode);
      if (!room) {
        send(ws, { type: "error", message: "Invalid room code." });
        return;
      }

      // Determine roles taken in the room
      const taken = new Set();
      for (const client of wss.clients) {
        if (client.readyState !== client.OPEN) continue;
        if (client._roomCode !== room.code) continue;
        if (client._role === "a" || client._role === "b") taken.add(client._role);
      }

      const role = roleForJoin(msg.preferredRole, room.state, taken);
      ws._roomCode = room.code;
      ws._role = role;

      send(ws, { type: "joined", room: room.code, role, state: room.state });
      broadcast(room.code, { type: "presence", room: room.code, role, action: "join" });
      return;
    }

    if (msg.type === "update") {
      const roomCode = ws._roomCode;
      const role = ws._role;
      if (!roomCode || (role !== "a" && role !== "b")) return;
      const room = getRoom(roomCode);
      if (!room) return;

      const patch = msg.patch && typeof msg.patch === "object" ? msg.patch : null;
      if (!patch) return;

      // Only allow patching own answers + submitted flag.
      if (patch.answers && typeof patch.answers === "object") {
        const target = role === "a" ? room.state.a : room.state.b;
        for (const [qid, opt] of Object.entries(patch.answers)) {
          if (typeof qid !== "string") continue;
          if (typeof opt !== "string") continue;
          target[qid] = opt;
        }
      }

      if (typeof patch.submitted === "boolean") {
        if (role === "a") room.state.submittedA = patch.submitted;
        if (role === "b") room.state.submittedB = patch.submitted;
      }
      if (typeof patch.nicknameA === "string" && role === "a") {
        room.state.nicknameA = String(patch.nicknameA).slice(0, 20);
      }
      if (typeof patch.nicknameB === "string" && role === "b") {
        room.state.nicknameB = String(patch.nicknameB).slice(0, 20);
      }

      room.state.updatedAt = now();
      broadcast(room.code, { type: "state", room: room.code, state: room.state });
      return;
    }

    if (msg.type === "reset") {
      const roomCode = ws._roomCode;
      if (!roomCode) return;
      const room = getRoom(roomCode);
      if (!room) return;
      room.state.a = {};
      room.state.b = {};
      room.state.submittedA = false;
      room.state.submittedB = false;
      room.state.nicknameA = "";
      room.state.nicknameB = "";
      room.state.updatedAt = now();
      broadcast(room.code, { type: "state", room: room.code, state: room.state });
      return;
    }
  });

  ws.on("close", () => {
    if (ws._roomCode) {
      broadcast(ws._roomCode, { type: "presence", room: ws._roomCode, role: ws._role, action: "leave" });
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Sync server listening on :${PORT}`);
});

