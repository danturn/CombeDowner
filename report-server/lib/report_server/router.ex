defmodule ReportServer.Router do
  @moduledoc """
  What the game sends in (`POST /report` from the F3 panel, `POST /beat` once a minute) and the
  pages to look at it all (`/`, `/reports/<id>`), which need the admin password. The game is a
  web page on another site, so the two POSTs answer only to the game's own addresses
  (ALLOWED_ORIGINS), and each IP is limited to a few reports an hour.
  """
  use Plug.Router
  alias ReportServer.{Html, RateLimit, Reports, Stats}

  @max_image 8_000_000
  @max_info 300_000

  plug :cors
  plug Plug.Parsers, parsers: [:urlencoded, :multipart], pass: ["*/*"], length: 10_000_000
  plug :match
  plug :dispatch

  get "/health", do: send_resp(conn, 200, "ok")

  options _, do: send_resp(conn, 204, "")

  post "/report" do
    with :ok <- origin_ok(conn),
         :ok <- RateLimit.hit({ip(conn), :report}, 12, 3600),
         %Plug.Upload{path: path} <- conn.params["screenshot"],
         {:ok, image} <- File.read(path),
         true <- byte_size(image) <= @max_image,
         ext when ext != nil <- image_kind(image),
         info when is_binary(info) and byte_size(info) <= @max_info <- conn.params["info"],
         {:ok, info} when is_map(info) <- Jason.decode(info) do
      info = Map.put_new(info, "userAgent", get_req_header(conn, "user-agent") |> List.first())
      id = Reports.save(image, ext, info)
      json(conn, 200, %{id: id})
    else
      :limited -> json(conn, 429, %{error: "too many reports, try again later"})
      {:origin, _} -> json(conn, 403, %{error: "not from the game"})
      _ -> json(conn, 400, %{error: "needs a screenshot (PNG or JPEG) and info (JSON)"})
    end
  end

  post "/beat" do
    with :ok <- origin_ok(conn),
         :ok <- RateLimit.hit({ip(conn), :beat}, 30, 60),
         {:ok, body, conn} <- read_body(conn, length: 4_000),
         {:ok, m} when is_map(m) <- Jason.decode(body),
         %{"sid" => sid} = info when is_binary(sid) and sid != "" <- Stats.clean(m) do
      Stats.beat(info)
      send_resp(conn, 204, "")
    else
      _ -> send_resp(conn, 204, "")
    end
  end

  get "/" do
    conn = admin(conn)
    if conn.halted, do: conn, else: html(conn, Html.index(Stats.summary(), Reports.list(), Reports.count()))
  end

  get "/reports/:id" do
    conn = admin(conn)

    cond do
      conn.halted -> conn
      r = Reports.get(id) -> html(conn, Html.report(r))
      true -> send_resp(conn, 404, "No such report")
    end
  end

  get "/reports/:id/shot" do
    conn = admin(conn)

    cond do
      conn.halted -> conn
      r = Reports.get(id) ->
        conn
        |> put_resp_content_type(if r.ext == "png", do: "image/png", else: "image/jpeg")
        |> put_resp_header("cache-control", "private, max-age=86400")
        |> send_file(200, r.image)

      true -> send_resp(conn, 404, "No such report")
    end
  end

  post "/reports/:id/delete" do
    conn = admin(conn)

    cond do
      conn.halted -> conn
      not same_site?(conn) -> send_resp(conn, 403, "Delete from the reports page")
      true ->
        Reports.delete(id)
        conn |> put_resp_header("location", "/") |> send_resp(303, "")
    end
  end

  match _, do: send_resp(conn, 404, "Not found")

  # ---- helpers -------------------------------------------------------------------------------

  defp allowed?(nil), do: false
  defp allowed?(origin), do: origin in Application.fetch_env!(:report_server, :allowed_origins)

  # Let the game's pages read our answers. Requests from anywhere else still arrive (a browser
  # only stops the page reading the reply), so the POSTs check the origin themselves too.
  defp cors(conn, _) do
    origin = get_req_header(conn, "origin") |> List.first()

    if allowed?(origin) do
      conn
      |> put_resp_header("access-control-allow-origin", origin)
      |> put_resp_header("vary", "origin")
      |> put_resp_header("access-control-allow-methods", "POST, OPTIONS")
      |> put_resp_header("access-control-allow-headers", "content-type")
      |> put_resp_header("access-control-max-age", "86400")
    else
      conn
    end
  end

  defp origin_ok(conn) do
    origin = get_req_header(conn, "origin") |> List.first()
    if allowed?(origin), do: :ok, else: {:origin, origin}
  end

  defp same_site?(conn) do
    case get_req_header(conn, "origin") do
      [] -> true
      [o] -> URI.parse(o).host == conn.host
    end
  end

  defp admin(conn) do
    case Application.get_env(:report_server, :admin_password) do
      pw when is_binary(pw) and pw != "" ->
        Plug.BasicAuth.basic_auth(conn, username: "admin", password: pw, realm: "Combe Downer reports")

      _ ->
        conn |> send_resp(503, "Set ADMIN_PASSWORD on the server to open this page") |> halt()
    end
  end

  # Railway's proxy puts the caller's address first in x-forwarded-for
  defp ip(conn) do
    case get_req_header(conn, "x-forwarded-for") do
      [v | _] -> v |> String.split(",") |> hd() |> String.trim()
      _ -> conn.remote_ip |> :inet.ntoa() |> to_string()
    end
  end

  defp image_kind(<<0x89, "PNG", _::binary>>), do: "png"
  defp image_kind(<<0xFF, 0xD8, 0xFF, _::binary>>), do: "jpg"
  defp image_kind(_), do: nil

  defp json(conn, status, body) do
    conn |> put_resp_content_type("application/json") |> send_resp(status, Jason.encode!(body))
  end

  defp html(conn, body), do: conn |> put_resp_content_type("text/html") |> send_resp(200, body)
end
