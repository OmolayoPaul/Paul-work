from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    app_name: str = "Afridetect EMR"
    database_url: str = "postgresql+psycopg://afridetect:afridetect_dev@db:5432/afridetect"

    # The account that owns the first super admin login.
    super_admin_email: str = "admin@afridetect.ng"
    super_admin_name: str = "System Administrator"

    # Initial password for the seeded super admin. When empty, the setup service
    # generates a random one and prints it once.
    super_admin_password: str = ""

    session_idle_minutes: int = 15
    session_absolute_hours: int = 12

    # Supplied by the platform for sandbox previews. Only the exact value "1"
    # enables preview-only behaviour (development sign-in accounts).
    base44_preview_mode: str = ""

    @property
    def preview_mode(self) -> bool:
        return self.base44_preview_mode.strip() == "1"

    @property
    def session_cookie_secure(self) -> bool:
        # The sandbox preview is served over https by the platform proxy, but
        # preview sign-in is also exercised over plain http during development.
        return not self.preview_mode


settings = Settings()
