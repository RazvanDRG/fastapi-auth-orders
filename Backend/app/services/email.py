import resend
from app.core.config import settings

resend.api_key = settings.resend_api_key


def send_password_reset_code(email: str, code: str, ttl_minutes: int) -> None:
    resend.Emails.send({
        "from": "Warehouse Operations Service <onboarding@resend.dev>",
        "to": email,
        "subject": "Your password reset code",
        "text": (
            f"Your password reset code is: {code}\n\n"
            f"This code expires in {ttl_minutes} minutes.\n\n"
            f"If you did not request this, you can ignore this email."
        )
    })


def send_account_deleted_email(email: str, display_name: str | None = None) -> None:
    greeting = f"Hi {display_name}," if display_name else "Hi,"

    resend.Emails.send({
        "from": "Warehouse Operations Service <onboarding@resend.dev>",
        "to": email,
        "subject": "Your account has been deleted",
        "text": (
            f"{greeting}\n\n"
            f"We are writing to confirm that your account associated with {email} "
            f"has been deleted.\n\n"
            f"If you did NOT request this deletion, please contact our support team immediately.\n\n"
            f"Thank you for using Warehouse Operations Service."
        )
    })