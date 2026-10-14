defmodule ReportServer.Html do
  @moduledoc "The two pages: the overview (players and the list of reports) and one report."

  @style """
  :root { color-scheme: light dark; --bg: #f6f5f1; --fg: #1d1d1b; --muted: #6b6a64; --card: #fff; --line: #dedcd4; --accent: #b4441c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161614; --fg: #ecebe6; --muted: #9a9890; --card: #22221f; --line: #383732; --accent: #f08a5d; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 22px; margin: 4px 0 16px; } h2 { font-size: 17px; margin: 28px 0 10px; }
  a { color: var(--accent); }
  .muted { color: var(--muted); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  .tile b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--muted); font-size: 13px; }
  table { border-collapse: collapse; width: 100%; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  th { font-weight: 600; color: var(--muted); font-size: 13px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
  .bar { display: inline-block; height: 8px; background: var(--accent); border-radius: 4px; vertical-align: middle; margin-right: 6px; }
  .reports { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .report { background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; text-decoration: none; color: inherit; display: block; }
  .report img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: #000; }
  .report div { padding: 8px 10px; font-size: 13px; }
  .report p { margin: 2px 0 0; color: var(--fg); font-size: 14px; }
  .shot { width: 100%; border-radius: 8px; display: block; background: #000; }
  pre { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow: auto; font-size: 12px; white-space: pre-wrap; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
  dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
  """

  def index(stats, reports, total) do
    t = stats.today

    page("Combe Downer reports", """
    <meta http-equiv="refresh" content="60">
    <h1>Combe Downer</h1>
    <div class="tiles">
      #{tile(stats.online, "online now")}
      #{tile(stats.online_players_in_rooms, "online in a room")}
      #{tile(t.visits, "visits today")}
      #{tile(t.played, "played today")}
      #{tile(t.peak, "most at once today")}
      #{tile(stats.fps_now || "–", "median fps now")}
      #{tile(total, "reports")}
    </div>

    <h2>Last two weeks</h2>
    #{history([Map.put(t, :today, true) | stats.history])}

    <h2>Today</h2>
    <div class="cols">
      #{breakdown("Online now, doing", stats.online_by_mode)}
      #{breakdown("Device", stats.today_by_device)}
      #{breakdown("Browser", stats.today_by_browser)}
      #{breakdown("Version", Enum.map(stats.today_by_build, fn {b, n} -> {build(b), n} end))}
    </div>

    <h2>Reports</h2>
    #{if reports == [], do: ~s{<p class="muted">None yet. In the game, open the debug panel (F3) and press "Send report".</p>}, else: ""}
    <div class="reports">#{Enum.map_join(reports, "\n", &card/1)}</div>
    <p class="muted">Updates every minute. Times are UTC.</p>
    """)
  end

  def report(%{id: id, info: i}) do
    fields = [
      {"Sent", when_(i["received"])},
      {"Player", i["name"]},
      {"Where", i["where"]},
      {"Version", build(i["build"])},
      {"Playing", i["mode"]},
      {"Map", i["map"]},
      {"Screen", i["screen"]},
      {"Browser", i["userAgent"]}
    ]

    page("Report #{id}", """
    <p><a href="/">← All reports</a></p>
    <h1>#{h(i["note"] || "Report")}</h1>
    <a href="/reports/#{id}/shot"><img class="shot" src="/reports/#{id}/shot" alt="Screenshot"></a>
    #{if is_binary(i["url"]) and String.starts_with?(i["url"], ["https://", "http://"]), do: ~s(<p><a href="#{h(i["url"])}" target="_blank" rel="noopener">Open the game at this spot</a></p>), else: ""}
    <h2>Details</h2>
    <dl>#{for {k, v} <- fields, v not in [nil, ""], into: "", do: "<dt>#{k}</dt><dd>#{h(v)}</dd>"}</dl>
    #{if is_binary(i["panel"]), do: "<h2>Debug panel</h2><pre>#{h(i["panel"])}</pre>", else: ""}
    <h2>Everything sent</h2>
    <pre>#{h(Jason.encode!(i, pretty: true))}</pre>
    <form method="post" action="/reports/#{id}/delete" onsubmit="return confirm('Delete this report?')"><button>Delete report</button></form>
    """)
  end

  defp card(%{id: id, info: i}) do
    """
    <a class="report" href="/reports/#{id}">
      <img src="/reports/#{id}/shot" loading="lazy" alt="">
      <div><span class="muted">#{h(when_(i["received"]))} · #{h(i["name"] || "?")} · #{h(i["mode"] || "")}</span>
      #{if i["note"] in [nil, ""], do: "", else: "<p>#{h(i["note"])}</p>"}</div>
    </a>
    """
  end

  defp history(days) do
    most = days |> Enum.map(& &1.visits) |> Enum.max(fn -> 1 end) |> max(1)

    rows =
      Enum.map_join(days, "\n", fn d ->
        label = if d[:today], do: "Today", else: Calendar.strftime(d.date, "%a %-d %b")

        "<tr><td>#{label}</td><td><span class=\"bar\" style=\"width:#{round(120 * d.visits / most)}px\"></span>#{d.visits}</td>" <>
          "<td>#{d.played}</td><td>#{d.in_rooms}</td><td>#{d.peak}</td></tr>"
      end)

    "<table><tr><th>Day</th><th>Visits</th><th>Played</th><th>In a room</th><th>Most at once</th></tr>#{rows}</table>"
  end

  defp breakdown(title, rows) do
    body =
      if rows == [],
        do: ~s(<tr><td class="muted">nobody yet</td><td></td></tr>),
        else: Enum.map_join(rows, "", fn {k, n} -> "<tr><td>#{h(k)}</td><td>#{n}</td></tr>" end)

    "<table><tr><th>#{title}</th><th></th></tr>#{body}</table>"
  end

  defp tile(n, label), do: ~s(<div class="tile"><b>#{h(n)}</b><span>#{label}</span></div>)

  # the game's version is when it last changed, in milliseconds
  defp build(ms) when is_integer(ms) do
    case DateTime.from_unix(ms, :millisecond) do
      {:ok, d} -> Calendar.strftime(d, "%-d %b %H:%M")
      _ -> to_string(ms)
    end
  end

  defp build(v), do: v

  defp when_(iso) when is_binary(iso) do
    case DateTime.from_iso8601(iso) do
      {:ok, d, _} -> Calendar.strftime(d, "%-d %b %H:%M")
      _ -> iso
    end
  end

  defp when_(v), do: v

  defp h(nil), do: ""
  defp h(v) when is_binary(v), do: v |> Plug.HTML.html_escape()
  defp h(v), do: v |> to_string() |> Plug.HTML.html_escape()

  defp page(title, body) do
    """
    <!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>#{h(title)}</title><style>#{@style}</style></head>
    <body><main>#{body}</main></body></html>
    """
  end
end
