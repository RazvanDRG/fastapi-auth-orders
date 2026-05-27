import smtplib
from email.message import EmailMessage
from app.core.config import settings


def send_password_reset_code(email: str, code: str, ttl_minutes: int) -> None:
    msg = EmailMessage()
    msg["Subject"] = "Your password reset code"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = email
    msg.set_content(
        f"Your password reset code is: {code}\n\n"
        f"This code expires in {ttl_minutes} minutes.\n\n"
        f"If you did not request this, you can ignore this email."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)


def send_account_deleted_email(email: str, display_name: str | None = None) -> None:
    greeting = f"Hi {display_name}," if display_name else "Hi,"
    msg = EmailMessage()
    msg["Subject"] = "Your account has been deleted"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = email
    msg.set_content(
        f"{greeting}\n\n"
        f"We are writing to confirm that your account associated with {email} has been deleted.\n\n"
        f"If you did NOT request this deletion, please contact our support team immediately.\n\n"
        f"Thank you for using {settings.smtp_from_name}."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)