import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from app.core.config import settings


def _get_api_instance():
    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = settings.brevo_api_key
    return sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))


def send_password_reset_code(email: str, code: str, ttl_minutes: int) -> None:
    if not settings.brevo_api_key:
        print(f"[EMAIL SKIP] No BREVO_API_KEY. Code for {email}: {code}", flush=True)
        return

    api = _get_api_instance()
    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": email}],
        sender={"name": settings.smtp_from_name, "email": settings.smtp_from_email},
        subject="Your password reset code",
        text_content=(
            f"Your password reset code is: {code}\n\n"
            f"This code expires in {ttl_minutes} minutes.\n\n"
            f"If you did not request this, you can ignore this email."
        )
    )
    api.send_transac_email(send_smtp_email)


def send_account_deleted_email(email: str, display_name: str | None = None) -> None:
    if not settings.brevo_api_key:
        print(f"[EMAIL SKIP] No BREVO_API_KEY. Account deleted email for {email}", flush=True)
        return

    greeting = f"Hi {display_name}," if display_name else "Hi,"
    api = _get_api_instance()
    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": email}],
        sender={"name": settings.smtp_from_name, "email": settings.smtp_from_email},
        subject="Your account has been deleted",
        text_content=(
            f"{greeting}\n\n"
            f"We are writing to confirm that your account associated with {email} has been deleted.\n\n"
            f"If you did NOT request this deletion, please contact our support team immediately.\n\n"
            f"Thank you for using {settings.smtp_from_name}."
        )
    )
    api.send_transac_email(send_smtp_email)