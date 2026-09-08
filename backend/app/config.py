from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://viduthalai:viduthalai@localhost:5432/viduthalai"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # Fernet key (32 url-safe base64-encoded bytes) used to encrypt stored GitLab tokens.
    # Generate a real one for production: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str = "USaICdTtz7VqvmQdPXdnOlF_bCRBCHo-vLxrGZcWe00="

    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
