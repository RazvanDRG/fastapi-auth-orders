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

    # Reset password settings
    password_reset_code_ttl_minutes: int = 10
    password_reset_max_attempts: int = 5
    password_reset_code_salt: str

    # Delete account brute-force protection
    delete_account_max_attempts: int = 5
    delete_account_lock_minutes: int = 15
    

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()