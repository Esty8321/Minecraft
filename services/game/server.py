# server.py
from __future__ import annotations
import asyncio, json, os, random
from typing import Dict, Tuple, Set

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

# ──────────────────────────────────────────────────────────────────────────────
W = H = 64
DTYPE = torch.uint8

BIT_IS_PLAYER = 0
BIT_HAS_LINK  = 1
BIT_R0, BIT_G0, BIT_B0 = 2, 3, 4
BIT_R1, BIT_G1, BIT_B1 = 5, 6, 7

COLOR_BITS = {
    "r": (BIT_R0, BIT_R1),
    "g": (BIT_G0, BIT_G1),
    "b": (BIT_B0, BIT_B1),
}

def set_bit(v: torch.Tensor, bit: int, one: bool) -> torch.Tensor:
    mask = torch.tensor(1 << bit, dtype=DTYPE)
    return (v | mask) if one else (v & (~mask & torch.tensor(0xFF, dtype=DTYPE)))

def get_bit(v: torch.Tensor, bit: int) -> torch.Tensor:
    return (v >> bit) & 1

def get2(v: torch.Tensor, b0: int, b1: int) -> torch.Tensor:
    return ((v >> b1) & 1) * 2 + ((v >> b0) & 1)

def set2(v: torch.Tensor, b0: int, b1: int, x: int) -> torch.Tensor:
    x &= 3
    v = v & (~(torch.tensor((1 << b0) | (1 << b1), dtype=DTYPE)) & torch.tensor(0xFF, dtype=DTYPE))
    if x & 1: v = v | torch.tensor(1 << b0, dtype=DTYPE)
    if x & 2: v = v | torch.tensor(1 << b1, dtype=DTYPE)
    return v

def inc_color(v: torch.Tensor) -> torch.Tensor:
    for (b0, b1) in COLOR_BITS.values():
        curr = int(get2(v, b0, b1))
        v = set2(v, b0, b1, (curr + 1) % 4)
    return v

# ──────────────────────────────────────────────────────────────────────────────
class Hub:
    """מצב המשחק + ניהול WS; לכל שחקן שומרים את הבייט שלו בנפרד."""
    def __init__(self) -> None:
        self.board: torch.Tensor = torch.zeros((H, W), dtype=DTYPE)
        self.sockets: Set[WebSocket] = set()
        self.pos_by_ws: Dict[WebSocket, Tuple[int, int]] = {}
        self.val_by_ws: Dict[WebSocket, torch.Tensor] = {}   # <── NEW
        self.lock = asyncio.Lock()

    # עזרי לוח
    def _in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < H and 0 <= c < W

    def _is_empty(self, r: int, c: int) -> bool:
        return int(get_bit(self.board[r, c], BIT_IS_PLAYER)) == 0

    def _clear_cell(self, r: int, c: int) -> None:
        self.board[r, c] = torch.tensor(0, dtype=DTYPE)

    def _random_empty_cell(self) -> Tuple[int, int]:
        candidates = [(r, c) for r in range(H) for c in range(W) if self._is_empty(r, c)]
        return random.choice(candidates) if candidates else (0, 0)

    # API פנימי
    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.sockets.add(ws)
        async with self.lock:
            r, c = self._random_empty_cell()
            # בייט התחלתי לשחקן: IsPlayer=1, שאר הביטים 0.
            v = set_bit(torch.tensor(0, dtype=DTYPE), BIT_IS_PLAYER, True)
            self.val_by_ws[ws] = v.clone()                 # <── שומרים את הבייט של השחקן
            self.pos_by_ws[ws] = (r, c)
            self.board[r, c] = v                           # כותבים לבורד
        await self.broadcast_matrix()

    async def disconnect(self, ws: WebSocket) -> None:
        async with self.lock:
            if ws in self.pos_by_ws:
                r, c = self.pos_by_ws.pop(ws)
                self._clear_cell(r, c)
            self.val_by_ws.pop(ws, None)
        self.sockets.discard(ws)
        await self.broadcast_matrix()

    async def move(self, ws: WebSocket, dr: int, dc: int) -> None:
        async with self.lock:
            r, c = self.pos_by_ws[ws]
            v = self.val_by_ws[ws]                         # <── משתמשים בבייט של השחקן
            nr, nc = r + dr, c + dc
            if self._in_bounds(nr, nc) and self._is_empty(nr, nc):
                self._clear_cell(r, c)
                # מבטיחים ש־IsPlayer דולק (למקרה ששינינו משהו בבייט)
                v = set_bit(v, BIT_IS_PLAYER, True)
                self.board[nr, nc] = v
                self.pos_by_ws[ws] = (nr, nc)
                self.val_by_ws[ws] = v                     # <── נשאר אותו בייט (עם הצבעים)
        await self.broadcast_matrix()

    async def color_plus_plus(self, ws: WebSocket) -> None:
        async with self.lock:
            r, c = self.pos_by_ws[ws]
            v = self.val_by_ws[ws]
            v = inc_color(v)                               # <── מעדכנים את הבייט של השחקן
            v = set_bit(v, BIT_IS_PLAYER, True)            # מבטיחים שחקן נשאר מסומן
            self.val_by_ws[ws] = v
            self.board[r, c] = v                           # משקפים לבורד
        await self.broadcast_matrix()

    async def broadcast_matrix(self) -> None:
        payload = {
            "type": "matrix",
            "w": W,
            "h": H,
            "data": self.board.flatten().tolist(),
        }
        dead: Set[WebSocket] = set()
        for s in list(self.sockets):
            try:
                await s.send_text(json.dumps(payload))
            except Exception:
                dead.add(s)
        for s in dead:
            await self.disconnect(s)

# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Voxel Server")
hub = Hub()

@app.get("/")
def root():
    return {"ok": True, "w": W, "h": H}
@app.get("/health")
def health():
    return {"ok": True, "service": "game"}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, username: str | None = None):
    await hub.connect(ws)
    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            k = (data.get("k") or "").lower()
            if k in ("arrowup", "up"):
                await hub.move(ws, -1, 0)
            elif k in ("arrowdown", "down"):
                await hub.move(ws, +1, 0)
            elif k in ("arrowleft", "left"):
                await hub.move(ws, 0, -1)
            elif k in ("arrowright", "right"):
                await hub.move(ws, 0, +1)
            elif k in ("c", "color", "color++"):
                await hub.color_plus_plus(ws)
    except WebSocketDisconnect:
        await hub.disconnect(ws)

# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)

