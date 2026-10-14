defmodule ReportServer.Stats do
  @moduledoc """
  Who's playing, from the game's heartbeat: each open game sends one when it starts and then once a
  minute, with a random id for that visit (no name, no IP), the version, phone or desktop, and
  what it's doing (in the menu, solo, in a room). Anyone heard from in the last two and a half
  minutes counts as online. The first time each visit is seen doing each thing in a day, a line
  goes in `stats/<date>.jsonl`, so the day's numbers survive a restart; the busiest moment of each
  day goes in `stats/peaks.json`.
  """
  use GenServer

  @online_ms 150_000
  @days 14

  def dir, do: Path.join(Application.fetch_env!(:report_server, :data_dir), "stats")

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @doc "Takes a heartbeat (already tidied by `clean/1`)."
  def beat(info), do: GenServer.cast(__MODULE__, {:beat, info})

  def summary, do: GenServer.call(__MODULE__, :summary)

  @doc "Keeps only the fields we know, as short strings or numbers."
  def clean(m) when is_map(m) do
    for {k, kind} <- [
          sid: :str, build: :num, device: :str, ios: :bool, mode: :str, map: :str, players: :num,
          fps: :num, view: :num, w: :num, h: :num, browser: :str
        ],
        v = m[Atom.to_string(k)],
        v = tidy(kind, v),
        v != nil,
        into: %{},
        do: {Atom.to_string(k), v}
  end

  def clean(_), do: %{}

  defp tidy(:str, v) when is_binary(v), do: String.slice(v, 0, 60)
  defp tidy(:num, v) when is_number(v), do: if(is_float(v), do: Float.round(v, 1), else: v)
  defp tidy(:bool, v) when is_boolean(v), do: v
  defp tidy(_, _), do: nil

  # ---- the server ----------------------------------------------------------------------------

  @impl true
  def init(_) do
    :timer.send_interval(30_000, :prune)
    today = Date.utc_today()
    {:ok, %{online: %{}, day: today, seen: load_seen(today), peaks: load_peaks(), past: %{}}}
  end

  @impl true
  def handle_cast({:beat, %{"sid" => sid} = info}, s) do
    s = roll(s)
    now = System.monotonic_time(:millisecond)
    mode = info["mode"] || "?"
    s = %{s | online: Map.put(s.online, sid, {now, info})}

    s =
      if MapSet.member?(s.seen, {sid, mode}) do
        s
      else
        line = info |> Map.put("t", DateTime.utc_now() |> DateTime.to_iso8601()) |> Jason.encode!()
        File.write!(day_file(s.day), [line, ?\n], [:append])
        %{s | seen: MapSet.put(s.seen, {sid, mode})}
      end

    {:noreply, note_peak(s)}
  end

  def handle_cast({:beat, _}, s), do: {:noreply, s}

  @impl true
  def handle_call(:summary, _from, s) do
    s = s |> roll() |> prune()
    online = Map.values(s.online) |> Enum.map(&elem(&1, 1))
    today = File.read(day_file(s.day)) |> lines()
    key = Date.to_iso8601(s.day)

    {history, past} =
      Enum.map_reduce(1..(@days - 1), s.past, fn back, cache ->
        d = Date.add(s.day, -back)
        counts = Map.get_lazy(cache, d, fn -> day_counts(File.read(day_file(d)) |> lines()) end)
        {Map.merge(counts, %{date: d, peak: s.peaks[Date.to_iso8601(d)] || 0}), Map.put(cache, d, counts)}
      end)

    firsts = today |> Enum.uniq_by(& &1["sid"])

    summary = %{
      online: length(online),
      online_by_mode: freq(online, "mode"),
      online_players_in_rooms: online |> Enum.filter(&(&1["mode"] == "room")) |> length(),
      today: Map.merge(day_counts(today), %{date: s.day, peak: s.peaks[key] || 0}),
      today_by_device: freq(firsts, "device"),
      today_by_build: freq(firsts, "build"),
      today_by_browser: freq(firsts, "browser"),
      fps_now: median(online |> Enum.map(& &1["fps"]) |> Enum.filter(&is_number/1)),
      history: history
    }

    {:reply, summary, %{s | past: past}}
  end

  @impl true
  def handle_info(:prune, s), do: {:noreply, s |> roll() |> prune()}

  # ---- helpers -------------------------------------------------------------------------------

  defp prune(s) do
    cut = System.monotonic_time(:millisecond) - @online_ms
    %{s | online: s.online |> Enum.filter(fn {_, {t, _}} -> t >= cut end) |> Map.new()}
  end

  # a new day: start counting afresh (the online list carries on)
  defp roll(s) do
    today = Date.utc_today()
    if today == s.day, do: s, else: %{s | day: today, seen: MapSet.new(), past: %{}}
  end

  defp note_peak(s) do
    key = Date.to_iso8601(s.day)
    n = map_size(s.online)

    if n > (s.peaks[key] || 0) do
      peaks = s.peaks |> Map.put(key, n) |> Enum.sort(:desc) |> Enum.take(400) |> Map.new()
      File.write!(Path.join(dir(), "peaks.json"), Jason.encode!(peaks))
      %{s | peaks: peaks}
    else
      s
    end
  end

  defp day_counts(rows) do
    sids = rows |> Enum.map(& &1["sid"]) |> Enum.uniq()
    played = rows |> Enum.filter(&(&1["mode"] in ["solo", "room", "mines"])) |> Enum.map(& &1["sid"]) |> Enum.uniq()
    in_rooms = rows |> Enum.filter(&(&1["mode"] == "room")) |> Enum.map(& &1["sid"]) |> Enum.uniq()
    %{visits: length(sids), played: length(played), in_rooms: length(in_rooms)}
  end

  defp freq(rows, k), do: rows |> Enum.frequencies_by(&(&1[k] || "?")) |> Enum.sort_by(&(-elem(&1, 1)))

  defp median([]), do: nil
  defp median(xs), do: xs |> Enum.sort() |> Enum.at(div(length(xs), 2))

  defp day_file(d), do: Path.join(dir(), Date.to_iso8601(d) <> ".jsonl")

  defp lines({:ok, body}) do
    for l <- String.split(body, "\n", trim: true), {:ok, m} <- [Jason.decode(l)], is_map(m), do: m
  end

  defp lines(_), do: []

  defp load_seen(day) do
    File.read(day_file(day)) |> lines() |> Enum.map(&{&1["sid"], &1["mode"] || "?"}) |> MapSet.new()
  end

  defp load_peaks do
    with {:ok, b} <- File.read(Path.join(dir(), "peaks.json")), {:ok, m} when is_map(m) <- Jason.decode(b),
         do: m,
         else: (_ -> %{})
  end
end
