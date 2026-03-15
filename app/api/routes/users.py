from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.core.rbac import require_roles
from app.core.roles import Roles

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(require_roles(Roles.ADMIN))],
)


@router.delete("/{user_id}", summary="Soft delete user")
def soft_delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_deleted:
        return {"message": "User already deleted"}

    user.is_deleted = True
    user.deleted_at = datetime.utcnow()

    db.commit()

    return {"message": "User soft deleted"}