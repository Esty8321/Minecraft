from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr
from typing import List, Dict, Any, Optional, Union
from pathlib import Path
from jose import jwt
import os, json, time, re

app = FastAPI()

DATA = Path(__file__).parent / "users.json"
DATA.parent.mkdir(parents=True, exist_ok=True)
if not DATA.exists():
    DATA.write_text(json.dumps({"users": []}, ensure_ascii=False, indent=2), encoding="utf-8")

JWT_SECRET = os.getenv("AUTH_JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL = 60 * 60 * 12  # 12 שעות

BIN8_RE = re.compile(r"^[01]{8}$")

class RegisterIn(BaseModel):
    username: str
    email: EmailStr

class LoginIn(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    user_id: Optional[Union[int, str]] = None  # מאפשר גם "00000010" וגם 2

def to_bin8(n: int) -> str:
    # מוודא טווח 0..255 ומחזיר כמחרוזת בינארית באורך 8
    return f"{(n & 0xFF):08b}"

def normalize_users(users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    ממיר id מספרי ישן ל-8 ביט מחרוזת, משאיר מחרוזות תקינות כמו שהן.
    """
    for u in users:
        uid = u.get("id")
        if isinstance(uid, int):
            u["id"] = to_bin8(uid)
        elif isinstance(uid, str) and BIN8_RE.fullmatch(uid):
            # כבר במבנה נכון
            pass
        else:
            # אם בפורמט לא צפוי, ננסה לפרסר למספר ולהמיר; אחרת נזרוק שגיאה
            try:
                n = int(uid)  # ינסה להמיר "0", "255" וכו'
                u["id"] = to_bin8(n)
            except Exception:
                raise HTTPException(500, f"bad_user_id_format: {uid!r}")
    return users

def load_db() -> Dict[str, Any]:
    with open(DATA, "r", encoding="utf-8") as f:
        db = json.load(f)
    # נרמול ids בכל טעינה
    db["users"] = normalize_users(db.get("users", []))
    return db

def save_db(obj: Dict[str, Any]):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def next_free_id(users: List[Dict[str, Any]]) -> str:
    """
    מחזיר מחרוזת 8 ביט פנויה בטווח 0..255.
    """
    used_nums = set()
    for u in users:
        uid = u.get("id")
        if isinstance(uid, str) and BIN8_RE.fullmatch(uid):
            used_nums.add(int(uid, 2))
        elif isinstance(uid, int):
            used_nums.add(uid & 0xFF)
        else:
            # כבר נרמֵלנו ב-load_db, אז לא אמור לקרות
            raise HTTPException(500, "corrupted_user_id")

    for n in range(256):
        if n not in used_nums:
            return to_bin8(n)

    raise HTTPException(409, "id_space_exhausted_0_255")

@app.post("/register")
def register(inp: RegisterIn):
    db = load_db()
    users = db.get("users", [])

    # מניעת כפילויות בשם משתמש או אימייל (case-insensitive)
    if any(u["username"].lower() == inp.username.lower() for u in users):
        raise HTTPException(409, "username_taken")
    if any(u["email"].lower() == inp.email.lower() for u in users):
        raise HTTPException(409, "email_taken")

    uid = next_free_id(users)  # ← מחזיר "00000000" וכו'
    user = {"id": uid, "username": inp.username, "email": inp.email}
    users.append(user)
    db["users"] = users
    save_db(db)
    return {"ok": True, "user": user}

@app.post("/login")
def login(inp: LoginIn):
    db = load_db()
    users = db.get("users", [])
    user = None

    # נסיון זיהוי לפי user_id (תומך גם במספר וגם במחרוזת 8 ביט)
    if inp.user_id is not None:
        if isinstance(inp.user_id, int):
            wanted = to_bin8(inp.user_id)
        elif isinstance(inp.user_id, str):
            # אם זה 8 ביט — נשאיר; אם זה מספר כמחרוזת — נהפוך ל-8 ביט
            wanted = inp.user_id if BIN8_RE.fullmatch(inp.user_id) else to_bin8(int(inp.user_id))
        else:
            raise HTTPException(400, "bad_user_id_type")

        user = next((u for u in users if u["id"] == wanted), None)

    # לפי username
    if not user and inp.username:
        user = next((u for u in users if u["username"].lower() == inp.username.lower()), None)

    # לפי email
    if not user and inp.email:
        user = next((u for u in users if u["email"].lower() == inp.email.lower()), None)

    if not user:
        raise HTTPException(401, "user_not_found")

    now = int(time.time())
    token = jwt.encode(
        {"sub": user["id"], "username": user["username"], "iat": now, "exp": now + JWT_TTL},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )
    return {"ok": True, "user": user, "token": token}

@app.get("/health")
def health():
    return {"ok": True, "service": "auth"}
