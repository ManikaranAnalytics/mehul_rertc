#!/usr/bin/env python3
"""Generate a bcrypt hash for seeding application users in the users table."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.admin.password import hash_password

if __name__ == "__main__":
    password = sys.argv[1] if len(sys.argv) > 1 else "AppUser@2026"
    print(hash_password(password))
