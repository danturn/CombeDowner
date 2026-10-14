defmodule ReportServer.Reports do
  @moduledoc """
  Reports sent from the game's F3 panel: a screenshot and what the panel showed, kept on disk as
  `reports/<id>/shot.jpg` (or .png) and `reports/<id>/info.json`. Ids start with the time, so
  sorting them sorts the reports.
  """

  @id ~r/\A\d{8}-\d{6}-[a-z0-9]{6}\z/

  def dir, do: Path.join(Application.fetch_env!(:report_server, :data_dir), "reports")

  @doc "Saves a report and returns its id."
  def save(image, ext, info) when ext in ["jpg", "png"] and is_map(info) do
    now = DateTime.utc_now()
    rand = :crypto.strong_rand_bytes(4) |> Base.encode32(case: :lower, padding: false) |> binary_part(0, 6)
    id = Calendar.strftime(now, "%Y%m%d-%H%M%S") <> "-" <> rand
    path = Path.join(dir(), id)
    File.mkdir_p!(path)
    File.write!(Path.join(path, "shot." <> ext), image)
    info = Map.put(info, "received", DateTime.to_iso8601(now))
    File.write!(Path.join(path, "info.json"), Jason.encode_to_iodata!(info, pretty: true))
    id
  end

  @doc "The newest reports first, with what each one said."
  def list(limit \\ 200) do
    case File.ls(dir()) do
      {:ok, ids} ->
        ids |> Enum.filter(&valid?/1) |> Enum.sort(:desc) |> Enum.take(limit) |> Enum.map(&get/1) |> Enum.reject(&is_nil/1)

      _ ->
        []
    end
  end

  def count do
    case File.ls(dir()) do
      {:ok, ids} -> Enum.count(ids, &valid?/1)
      _ -> 0
    end
  end

  def get(id) do
    with true <- valid?(id),
         path = Path.join(dir(), id),
         {:ok, json} <- File.read(Path.join(path, "info.json")),
         {:ok, info} <- Jason.decode(json) do
      ext = if File.exists?(Path.join(path, "shot.png")), do: "png", else: "jpg"
      %{id: id, info: info, ext: ext, image: Path.join(path, "shot." <> ext)}
    else
      _ -> nil
    end
  end

  def delete(id) do
    if valid?(id), do: File.rm_rf(Path.join(dir(), id))
    :ok
  end

  def valid?(id), do: is_binary(id) and Regex.match?(@id, id)
end
