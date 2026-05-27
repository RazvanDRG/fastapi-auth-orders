from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    LogoutRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
    UpdateProfileRequest,
    DeleteAccountRequest,
)
from app.services.auth import (
    verify_password,
    create_access_token,
    issue_password_reset_code,
    reset_password_with_code,
    register_user,
)

from app.services.email import send_password_reset_code
from app.services.refresh_tokens import (
    issue_refresh_token,
    rotate_refresh_token,
    revoke_refresh_token,
)
from app.services.users_service import self_delete_account

router = APIRouter(prefix="/auth", tags=["Login"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    return register_user(
        db=db,
        email=payload.email,
        password=payload.password,
        confirm_password=payload.confirm_password,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))

    if not user or user.is_deleted or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    access = create_access_token(subject=user.email, role=user.role)
    refresh = issue_refresh_token(db, user_id=user.id)
    db.commit()

    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    generic_response = MessageResponse(
        message="If the account exists, a reset code was sent."
    )

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or user.is_deleted:
        return generic_response

    try:
        code = issue_password_reset_code(db, user_id=user.id)
        db.commit()

        try:
            print(f"[FORGOT] Sending email to {user.email}, api_key set: {bool(settings.resend_api_key)}", flush=True)  # ← aici
            send_password_reset_code(
                email=user.email,
                code=code,
                ttl_minutes=settings.password_reset_code_ttl_minutes,
            )
        except Exception as e:
            print(f"SMTP ERROR: {repr(e)}", flush=True)

        try:
            send_password_reset_code(
                email=user.email,
                code=code,
                ttl_minutes=settings.password_reset_code_ttl_minutes,
            )
        except Exception as e:
            import logging
            logging.error(f"Failed to send reset email to {user.email}: {e}")

        return generic_response

    except Exception as exc:
        db.rollback()
        print("FORGOT_PASSWORD_ERROR:", repr(exc), flush=True)
        raise HTTPException(
            status_code=502,
            detail="Could not send password reset email"
        )
        

@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_password_with_code(
        db=db,
        email=payload.email,
        code=payload.code,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
    )
    db.commit()

    return MessageResponse(message="Password was reset successfully.")


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user_id = rotate_refresh_token(db, payload.refresh_token)

    new_refresh = issue_refresh_token(db, user_id=user_id)

    user = db.scalar(select(User).where(User.id == user_id))
    if not user or user.is_deleted:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_access_token(subject=user.email, role=user.role)

    db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    revoke_refresh_token(db, payload.refresh_token)
    db.commit()
    return {"message": "logged out"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
    }
    

@router.patch("/me")
def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.first_name = payload.first_name.strip()
    current_user.last_name = payload.last_name.strip()

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
    }
    
    
@router.delete("/me", summary="Delete the currently authenticated user's account")
def delete_my_account(
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return self_delete_account(db, current_user, password=payload.password)

@router.get("/test-email")
def test_email():
    from app.services.email import send_password_reset_code
    try:
        send_password_reset_code("razvan.dornea1@gmail.com", "123456", 10)
        return {"status": "sent"}
    except Exception as e:
        return {"status": "error", "detail": repr(e)}