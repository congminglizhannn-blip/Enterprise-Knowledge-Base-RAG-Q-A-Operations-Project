from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:password@localhost:5432/rag_db"
    deepseek_api_key: str = "sk-xxxxx"
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    deepseek_reasoning_effort: str | None = None
    deepseek_thinking_enabled: bool = False
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    refresh_token_expire_minutes: int = 10080
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 10
    cors_origins: list[str] = Field(default_factory=lambda: ["http://127.0.0.1:3000"])
    initial_admin_username: str = "Admin"
    initial_admin_password: str = "7777"
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    feishu_app_id: str | None = None
    feishu_app_secret: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                import json

                return json.loads(stripped)
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    env_path = Path(".env")
    if not settings.feishu_app_id or not settings.feishu_app_secret:
        aliases = {
            "App_ID": "feishu_app_id",
            "APP_ID": "feishu_app_id",
            "FEISHU_APP_ID": "feishu_app_id",
            "App_App Secret": "feishu_app_secret",
            "App_App_Secret": "feishu_app_secret",
            "App_Secret": "feishu_app_secret",
            "APP_APP_SECRET": "feishu_app_secret",
            "APP_SECRET": "feishu_app_secret",
            "FEISHU_APP_SECRET": "feishu_app_secret",
        }
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if "=" not in line or line.strip().startswith("#"):
                    continue
                key, value = line.split("=", 1)
                target = aliases.get(key.strip())
                if target and not getattr(settings, target):
                    setattr(settings, target, value.strip().strip('"').strip("'"))
    return settings


settings = get_settings()
