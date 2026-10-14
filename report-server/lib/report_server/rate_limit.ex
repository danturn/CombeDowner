defmodule ReportServer.RateLimit do
  @moduledoc """
  A count of requests per key (usually an IP and what it's sending) in fixed windows, so one
  browser can't flood the server. Old windows are swept away once a minute.
  """
  use GenServer

  @table __MODULE__

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @doc "Counts one request; :ok while the key has had at most `limit` in this `window` seconds."
  def hit(key, limit, window) do
    w = div(System.system_time(:second), window)
    n = :ets.update_counter(@table, {key, window, w}, 1, {{key, window, w}, 0})
    if n <= limit, do: :ok, else: :limited
  end

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    :timer.send_interval(60_000, :sweep)
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, s) do
    now = System.system_time(:second)
    # a window is over once (w + 1) * window has passed
    :ets.select_delete(@table, [
      {{{:_, :"$1", :"$2"}, :_}, [{:<, {:*, {:+, :"$2", 1}, :"$1"}, now}], [true]}
    ])

    {:noreply, s}
  end
end
