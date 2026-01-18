from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Warehouse Operations Service"
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 60

    class Config:
        env_file = ".env"

settings = Settings()