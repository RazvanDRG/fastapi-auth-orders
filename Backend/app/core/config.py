from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Warehouse Operations Service"
    
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 60
    
    # Refresh token settings
    refresh_token_ttl_days: int = 30
    refresh_token_salt: str

    smtp_host: str
    smtp_port: int = 587
    smtp_use_tls: bool = True
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str = "Warehouse Operations Service"
    brevo_api_key: str = ""

    # Reset password settings
    password_reset_code_ttl_minutes: int = 10
    password_reset_max_attempts: int = 5
    password_reset_code_salt: str

    # Delete account brute-force protection
    delete_account_max_attempts: int = 5
    delete_account_lock_minutes: int = 15

    # Kafka (Aiven for Apache Kafka - SASL_SSL)
    kafka_bootstrap_servers: str = ""
    kafka_username: str = ""
    kafka_password: str = ""
    kafka_ssl_ca_path: str = ""

    # Rate limits (in-memory, per instance). Tests lower these; docker-compose raises them.
    rate_limit_login_max: int = 10
    rate_limit_login_window_seconds: int = 60
    rate_limit_forgot_password_max: int = 3
    rate_limit_forgot_password_window_seconds: int = 900
    rate_limit_create_order_max: int = 30
    rate_limit_create_order_window_seconds: int = 60
    # Header the edge proxy sets to the real caller IP (Cloudflare in front of Render)
    client_ip_header: str = "cf-connecting-ip"


    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()