# Railway builds this (root directory report-server). Two stages: build a release, then run it
# on a small Debian image.
ARG ELIXIR=1.17.3-erlang-27.1.2-debian-bookworm-20260610-slim
FROM hexpm/elixir:${ELIXIR} AS build
ENV MIX_ENV=prod LANG=C.UTF-8
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
COPY config config
RUN mix deps.get --only prod && mix deps.compile
COPY lib lib
RUN mix release

FROM debian:bookworm-20260610-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV LANG=C.UTF-8 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/_build/prod/rel/report_server ./
CMD ["bin/report_server", "start"]
