# Report server

Takes in what the game sends and shows it on a small password-protected page:

- **Reports** from the F3 debug panel's "Send report" button: a screenshot, an optional note, a
  link back to the spot (`?at=`), and everything the panel was showing.
- **A heartbeat** from every open game, once a minute: a random id for the visit, the version,
  phone or desktop, browser, and what it's doing (menu, solo, in a room, down the mines), plus the
  frame rate. No names or IP addresses are kept. The page shows who's online now, visits and
  players a day for two weeks, the busiest moment each day, and which versions are in use.

The game only talks to it when it's built with `VITE_REPORT_URL` set to this server's address
(the `REPORT_URL` repo secret, in `.github/workflows/pages.yml`); otherwise the button is hidden and
nothing is sent.

## Endpoints

- `POST /report`: multipart form, `screenshot` (PNG or JPEG, up to 8 MB) and `info` (JSON).
  Answers `{"id": ...}`. At most 12 an hour from one IP.
- `POST /beat`: a JSON body (sent as `text/plain`, so the browser needn't ask first).
- `GET /`, `GET /reports/<id>`: the pages, behind the admin password (user `admin`).
- `GET /health`: `ok`.

The POSTs are only accepted from the game's own addresses (`ALLOWED_ORIGINS`).

## Settings (environment variables)

- `ADMIN_PASSWORD`: the pages' password. Without it the pages stay locked.
- `DATA_DIR`: where reports and daily numbers are kept (`/data` in the Docker image: mount a
  Railway volume there, or they're lost on every deploy).
- `ALLOWED_ORIGINS`: comma separated; defaults to both GitHub Pages sites and the local dev server.
- `PORT`: set by Railway.

## Railway

A service from this repo with root directory `/report-server` builds the `Dockerfile` here. Attach
a volume at `/data`, set `ADMIN_PASSWORD`, and generate a domain under Settings → Networking.

## Running it locally

    mix deps.get
    ADMIN_PASSWORD=pw DATA_DIR=data mix run --no-halt   # http://localhost:4000
