from pathlib import Path
import torch

# Board size and dtype
W = H = 64
DTYPE = torch.uint8

# Bit layout
BIT_IS_PLAYER = 0
BIT_HAS_LINK  = 1
BIT_R0, BIT_G0, BIT_B0 = 2, 3, 4
BIT_R1, BIT_G1, BIT_B1 = 5, 6, 7

COLOR_BITS = {
    "r": (BIT_R0, BIT_R1),
    "g": (BIT_G0, BIT_G1),
    "b": (BIT_B0, BIT_B1),
}

# SQLite file path
DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)  # creates ./data if missing
DB_PATH = DATA_DIR/ "world.db"
