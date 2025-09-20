# import os, json
# from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# import uvicorn

# from .settings import W, H
# from .hub import Hub

# app = FastAPI(title="Voxel Server")
# hub = Hub()

# @app.get("/")
# def root():
#     return {"ok": True, "w": W, "h": H}

# @app.websocket("/ws")
# async def ws_endpoint(ws: WebSocket):
#     await ws.accept()
#     await hub.connect(ws)
#     try:
#         while True:
#             msg = await ws.receive_text()
#             data = json.loads(msg)
#             k = (data.get("k") or "").lower()
#             if k in ("arrowup", "up"):
#                 await hub.move(ws, -1, 0)
#             elif k in ("arrowdown", "down"):
#                 await hub.move(ws, +1, 0)
#             elif k in ("arrowleft", "left"):
#                 await hub.move(ws, 0, -1)
#             elif k in ("arrowright", "right"):
#                 await hub.move(ws, 0, +1)
#             elif k in ("c", "color", "color++"):
#                 await hub.color_plus_plus(ws)
#             elif k in ("whereami",):
#                 await hub._send_chunk(ws)
#     except WebSocketDisconnect:
#         await hub.disconnect(ws)

# if __name__ == "__main__":
#     uvicorn.run("server.main:app",
#                 host="0.0.0.0",
#                 port=int(os.getenv("PORT", "8000")),
#                 reload=True)


# server/main.py
import os, json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

from .settings import W, H
from .hub import Hub
from .db import clear_player_bits_all   # NEW

app = FastAPI(title="Voxel Server")
hub = Hub()

# NEW: בעת עליית האפליקציה - ניקוי ביטי שחקן היסטוריים מכל הצ'אנקים
@app.on_event("startup")
async def startup_event():
    clear_player_bits_all()

# NEW (רשות אך מומלץ): בעת כיבוי - ניתוק מסודר כדי לשחזר קרקע בתאים הנוכחיים
@app.on_event("shutdown")
async def shutdown_event():
    # נעתיק לרשימה כדי לא להתנגש בשינוי תוך כדי איטרציה
    for ws in list(hub.pos_by_ws.keys()):
        try:
            await hub.disconnect(ws)
        except Exception:
            pass

@app.get("/")
def root():
    return {"ok": True, "w": W, "h": H}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
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
            elif k in ("whereami",):
                await hub._send_chunk(ws)
    except WebSocketDisconnect:
        await hub.disconnect(ws)

if __name__ == "__main__":
    uvicorn.run("server.main:app",
                host="0.0.0.0",
                port=int(os.getenv("PORT", "8000")),
                reload=True)
