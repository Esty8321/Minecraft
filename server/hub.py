import asyncio, json, random
from typing import Dict, Tuple, Set, Optional
import torch
from fastapi import WebSocket

from .settings import W, H, DTYPE, BIT_IS_PLAYER
from .bits import set_bit, get_bit, inc_color, make_color, with_player, without_player
from .ids import chunk_id_from_coords, coords_from_chunk_id
from .db import save_chunk, load_chunk

class Hub:
    """
    Infinite world of 64×64 chunks.
    Player color is fixed for the whole session.
    Pressing "C" paints the ground color of the current cell (persists in the board).
    """
    def __init__(self) -> None:
        self.chunks: Dict[str, torch.Tensor] = {}         # cid -> tensor(H,W)
        self.watchers: Dict[str, Set[WebSocket]] = {}     # cid -> set(ws)

        self.root_cid = chunk_id_from_coords(0, 0)
        self._ensure_chunk(self.root_cid)

        self.sockets: Set[WebSocket] = set()
        self.pos_by_ws: Dict[WebSocket, Tuple[str, int, int]] = {}
        self.val_by_ws: Dict[WebSocket, torch.Tensor] = {}  # kept for compatibility (unused for color logic)
        # NEW:
        self.player_color: Dict[WebSocket, torch.Tensor] = {}     # fixed color (no player bit)
        self.underlying_by_ws: Dict[WebSocket, torch.Tensor] = {} # ground byte under the player (no player bit)

        self.lock = asyncio.Lock()

    # ── chunks ────────────────────────────────────────────────────────────────
    def _ensure_chunk(self, cid: str) -> torch.Tensor:
        if cid in self.chunks:
            return self.chunks[cid]
        loaded = load_chunk(cid)
        if loaded is None:
            loaded = torch.zeros((H, W), dtype=DTYPE)
            save_chunk(cid, loaded)
        self.chunks[cid] = loaded
        self.watchers.setdefault(cid, set())
        return loaded

    def _is_empty(self, board: torch.Tensor, r: int, c: int) -> bool:
        return int(get_bit(board[r, c], BIT_IS_PLAYER)) == 0

    def _random_empty_cell(self, board: torch.Tensor) -> Tuple[int, int]:
        for _ in range(4096):
            r = random.randrange(H)
            c = random.randrange(W)
            if self._is_empty(board, r, c):
                return r, c
        return H // 2, W // 2

    # ── neighbors (computed, not stored) ──────────────────────────────────────
    def neighbor_cid(self, cid: str, direction: str) -> str:
        cx, cy = coords_from_chunk_id(cid)
        if direction == "up":    cy -= 1
        if direction == "down":  cy += 1
        if direction == "left":  cx -= 1
        if direction == "right": cx += 1
        return chunk_id_from_coords(cx, cy)

    # ── connect / disconnect ─────────────────────────────────────────────────
    async def connect(self, ws: WebSocket) -> None:
        self.sockets.add(ws)
        async with self.lock:
            cid = self.root_cid
            board = self._ensure_chunk(cid)
            r, c = self._random_empty_cell(board)

            # Pick a fixed player color once (2-bit per channel 0..3)
            pr = random.randint(0, 3)
            pg = random.randint(0, 3)
            pb = random.randint(0, 3)
            pcolor = make_color(pr, pg, pb)         # no player bit
            self.player_color[ws] = pcolor

            # Save underlying ground and draw the player on top
            underlying = without_player(board[r, c]) # store ground (no player bit)
            self.underlying_by_ws[ws] = underlying

            board[r, c] = with_player(pcolor)       # cell shows the player with his fixed color
            save_chunk(cid, board)

            self.val_by_ws[ws] = with_player(pcolor).clone()  # compatibility
            self.pos_by_ws[ws] = (cid, r, c)
            self.watchers[cid].add(ws)

        await self._send_chunk(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self.lock:
            if ws in self.pos_by_ws:
                cid, r, c = self.pos_by_ws.pop(ws)
                board = self._ensure_chunk(cid)

                # Restore the ground color under the player when leaving
                underlying = self.underlying_by_ws.pop(ws, torch.tensor(0, dtype=DTYPE))
                board[r, c] = underlying
                save_chunk(cid, board)

                self.watchers.get(cid, set()).discard(ws)
                await self._broadcast_chunk(cid)

            self.val_by_ws.pop(ws, None)
            self.player_color.pop(ws, None)
        self.sockets.discard(ws)

    # ── actions ───────────────────────────────────────────────────────────────
    async def move(self, ws: WebSocket, dr: int, dc: int) -> None:
        async with self.lock:
            cid, r, c = self.pos_by_ws[ws]
            board = self._ensure_chunk(cid)
            pcolor = self.player_color[ws]

            nr, nc = r + dr, c + dc
            # within same chunk
            if 0 <= nr < H and 0 <= nc < W:
                if self._is_empty(board, nr, nc):
                    # leave old cell: restore its ground
                    old_under = self.underlying_by_ws[ws]
                    board[r, c] = old_under

                    # enter new cell: remember its ground, then draw player color
                    new_under = without_player(board[nr, nc])
                    self.underlying_by_ws[ws] = new_under
                    board[nr, nc] = with_player(pcolor)

                    self.pos_by_ws[ws] = (cid, nr, nc)
                    save_chunk(cid, board)
                    await self._broadcast_chunk(cid)
                return

            # crossing chunk border
            direction = None
            if nr < 0:        direction = "up"
            elif nr >= H:     direction = "down"
            elif nc < 0:      direction = "left"
            elif nc >= W:     direction = "right"

            new_cid = self.neighbor_cid(cid, direction or "right")
            new_board = self._ensure_chunk(new_cid)
            if direction == "up":
                tr, tc = H - 1, c
            elif direction == "down":
                tr, tc = 0, c
            elif direction == "left":
                tr, tc = r, W - 1
            else:
                tr, tc = r, 0

            if self._is_empty(new_board, tr, tc):
                # leave old chunk cell: restore ground
                old_under = self.underlying_by_ws[ws]
                board[r, c] = old_under
                save_chunk(cid, board)

                # enter new chunk cell: remember ground and draw player
                new_under = without_player(new_board[tr, tc])
                self.underlying_by_ws[ws] = new_under
                new_board[tr, tc] = with_player(pcolor)
                save_chunk(new_cid, new_board)

                self.pos_by_ws[ws] = (new_cid, tr, tc)

                self.watchers[cid].discard(ws)
                self.watchers.setdefault(new_cid, set()).add(ws)

                await self._broadcast_chunk(cid)
                await self._broadcast_chunk(new_cid)
            # else: target blocked → no move


    async def color_plus_plus(self, ws: WebSocket) -> None:
     """
     צובע מייד את התא שעליו עומד השחקן, וגם שומר את הקרקע כך שהצבע יישאר
     לאחר שהשחקן יזוז מהתא.
     """
     async with self.lock:
         cid, r, c = self.pos_by_ws[ws]
         board = self._ensure_chunk(cid)

         # 1) עדכן את צבע הקרקע השמור (ללא ביט שחקן)
         under = self.underlying_by_ws.get(ws, torch.tensor(0, dtype=DTYPE))
         under = inc_color(under)             # מעלה את r,g,b (2 ביט לכל ערוץ)
         self.underlying_by_ws[ws] = under    # נשמר כדי שכאשר נצא מהתא, הקרקע הזו תישאר

         # 2) כתוב מיידית לתא את הקרקע *עם* ביט השחקן, כדי שהשינוי ייראה עכשיו
         board[r, c] = with_player(under)

         # 3) התמדה ושידור
         save_chunk(cid, board)

     await self._broadcast_chunk(cid)


    # ── send/broadcast ───────────────────────────────────────────────────────
    async def _send_chunk(self, ws: WebSocket) -> None:
        if ws not in self.pos_by_ws:
            return
        cid, _, _ = self.pos_by_ws[ws]
        board = self._ensure_chunk(cid)
        payload = {
            "type": "matrix",
            "w": W, "h": H,
            "data": board.flatten().tolist(),
            "chunk_id": cid,
        }
        await ws.send_text(json.dumps(payload))

    async def _broadcast_chunk(self, cid: str) -> None:
        board = self._ensure_chunk(cid)
        payload = {
            "type": "matrix",
            "w": W, "h": H,
            "data": board.flatten().tolist(),
            "chunk_id": cid,
        }
        dead: Set[WebSocket] = set()
        for s in list(self.watchers.get(cid, set())):
            try:
                await s.send_text(json.dumps(payload))
            except Exception:
                dead.add(s)
        for s in dead:
            await self.disconnect(s)
