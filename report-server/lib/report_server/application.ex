defmodule ReportServer.Application do
  @moduledoc false
  use Application
  require Logger

  @impl true
  def start(_type, _args) do
    port = Application.fetch_env!(:report_server, :port)
    File.mkdir_p!(ReportServer.Reports.dir())
    File.mkdir_p!(ReportServer.Stats.dir())

    unless Application.get_env(:report_server, :admin_password),
      do: Logger.warning("ADMIN_PASSWORD isn't set, so the reports page is locked until it is")

    children = [
      ReportServer.RateLimit,
      ReportServer.Stats,
      {Bandit, plug: ReportServer.Router, port: port}
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: ReportServer.Supervisor)
  end
end
