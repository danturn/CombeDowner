import Config

# Everything comes from the environment, so Railway's variables set it (README.md in this folder).
default_origins =
  "https://spencereholtaway.github.io,https://danturn.github.io,http://localhost:5173,http://127.0.0.1:5173"

config :report_server,
  port: String.to_integer(System.get_env("PORT", "4000")),
  data_dir: System.get_env("DATA_DIR", "data"),
  admin_password: System.get_env("ADMIN_PASSWORD"),
  allowed_origins:
    System.get_env("ALLOWED_ORIGINS", default_origins)
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
