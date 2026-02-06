from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, LogoutRequest
from app.services.auth import hash_password, verify_password, create_access_token
from app.api.security import get_current_user
from app.services.refresh_tokens import issue_refresh_token, rotate_refresh_token, revoke_refresh_token
from app.services.auth import create_access_token



router = APIRouter(prefix="/auth", tags=["Login"])

@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    password = payload.password.strip()

    user = User(
        email=payload.email,
        hashed_password=hash_password(password),
    )

    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "registered"}

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))

    password = payload.password.strip()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access = create_access_token(subject=user.email)

    # create & store refresh in DB
    refresh = issue_refresh_token(db, user_id=user.id)
    db.commit()

    return TokenResponse(access_token=access, refresh_token=refresh)

@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user_id = rotate_refresh_token(db, payload.refresh_token)

    # issue new refresh (rotation)
    new_refresh = issue_refresh_token(db, user_id=user_id)

    # fetch user email for access token
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_access_token(subject=user.email)

    db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)

@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    revoke_refresh_token(db, payload.refresh_token)
    db.commit()
    return {"message": "logged out"}

@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email, "role": current_user.role}