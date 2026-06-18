import os

from fastapi import HTTPException, status

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "12345")


def validate_admin_credentials(username: str, password: str) -> str:
    """Validate fixed admin credentials from environment configuration."""
    if username.strip() != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )
    return ADMIN_USERNAME
