from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MT_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./macroternary.db"
    family_seed_path: Path = Path("./seeds/food_families.json")
    snapshot_out_dir: Path = Path("./public")
    admin_host: str = "127.0.0.1"
    admin_port: int = 8000

    ollama_host: str = "http://127.0.0.1:11434"
    vlm_model: str = "qwen2.5vl:7b"


settings = Settings()
