from fastapi import Depends, HTTPException
from app.api.security import get_current_user
from app.models.user import User


def require_roles(*roles: str):
    def _dep(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user
    return _dep
