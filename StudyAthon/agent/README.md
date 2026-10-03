# StudyAthon ADK agent

This is a small Python backend for the Expo app. The app calls `/chat` and
`/ingest`; the Google ADK agents and Google API key stay on this server.

## Endpoints

| Route | Purpose | Success | Client errors |
| --- | --- | --- | --- |
| `GET /health` | Liveness check. | `200` | — |
| `POST /chat` | The study tutor. JSON body `{"message": "..."}`. | `200` | `422` empty, `502` model failure |
| `POST /ingest` | Notes/PDF/slides/YouTube → validated MCQ bank. Multipart form. | `200` | `413` too large, `422` bad input, `502` model failure |

## Note ingestion

`/ingest` runs four agents in sequence and hands work between them through session
state:

```
SequentialAgent "studyathon_ingest"
  1. source_normalizer   raw input      -> source_notes
  2. concept_extractor   source_notes   -> concepts
  3. question_writer     concepts       -> questions
  4. grounding_validator questions      -> question_bank
```

Response fields: `questions` (approved), `rejected`, `coverage_gaps`, `concepts`,
`source_notes`.

Design notes:

- **Only stage 1 sees the raw bytes.** Pasted notes, PDFs and slide photos arrive
  as inline parts and a YouTube URL arrives as `file_data`. Stages 2-4 run with
  `include_contents='none'` and read the previous stage's output from session
  state, so the PDF is uploaded once, not four times.
- **Every schema field has a default.** ADK validates a stage's output against
  its `output_schema`, and a validation error aborts the whole run. Quality
  decisions belong to `grounding_validator`, not to Pydantic.
- **Every stage uses `ResilientGemini`**, which retries transient errors with
  backoff and falls through to the next model. See "Model availability" below.
- **`LoopAgent` is deliberately unused.** It is deprecated in ADK 2.11 in favour
  of a graph-based `Workflow` that is not yet exported from `google.adk.agents`.
  If per-concept batching is ever needed, use a `Workflow` with a dynamic fan-out.

### Cost and latency

Four sequential model calls, so a full run takes **3-4 minutes** for a
text-only note set and ~35s for a short mixed request on a fast model. This is a
batch operation, not something to call on a keystroke.

### Requesting questions

`/ingest` takes multipart form fields: `text`, repeatable `urls`, and repeatable
`files`. Any combination works, so a photo of a whiteboard and a lecture URL can
be sent together.

```sh
curl -X POST http://localhost:8000/ingest \
  -F "text=Photosynthesis converts light into chemical energy" \
  -F "urls=https://youtu.be/dQw4w9WgXcQ" \
  -F "files=@fixtures/sample_notes.txt"
```

`files` must be `multipart/form-data`, not a JSON body — declaring `UploadFile`
inside a Pydantic model makes FastAPI parse the body as JSON and reject every
multipart request, so the fields are declared explicitly.

Uploaded files are checked by magic bytes before any request is made: a `.pdf`
needs a `%PDF-` header and a `%%EOF` trailer, and images need their PNG/JPEG/WebP
signature. This matters because a malformed upload answers `400
INVALID_ARGUMENT` on *every* model, which is otherwise indistinguishable from a
server outage at the endpoint.

### Model availability

`gemini-3.8-flash` returns `503 UNAVAILABLE ... high demand` intermittently, and
a single 503 would otherwise kill an entire four-stage run. `ResilientGemini`
(`study_buddy/resilient.py`) wraps each model call to retry with exponential
backoff, then try the next candidate.

Three subtleties it handles:

- `models.list()` is not an availability signal. `gemini-2.5-flash` and
  `gemini-3.1-flash` both appeared in the listing but returned 404 on
  `generate_content`. Availability has to be probed.
- Each attempt gets a **deep copy** of the request. `Gemini` rewrites
  `content.parts` in place, so a naive retry resends duplicated content.
- A 429 is not always retryable. The Gemini free tier caps
  `generate_content_free_tier_requests` per day, per model, and reports a wait
  measured in hours (`retryDelay: "16531s"`). Retrying that with backoff just
  burns time, so a multi-hour `RetryInfo` is classified as "try a different
  model" instead.

A 429 from a blocked model is deliberately **not** treated as evidence that the
payload was fine. Otherwise a corrupt upload hides behind a quota error until the
next day instead of being reported as a `422`.

### Free-tier quota

The free tier allows **20 requests per day per model**, and one ingestion run
makes **4 requests**. That is roughly 5 ingestions per model per day, or ~20 per
day across the four-model fallback chain. When the whole chain is exhausted,
`/ingest` returns `502` with the reset time in the server log. Enable billing
before demoing or repeatedly testing.

### Without the server

```sh
python ingest_notes.py fixtures/sample_notes.txt
python ingest_notes.py --url https://youtu.be/dQw4w9WgXcQ --json
```

Plain `.txt`/`.md` files are routed into the text part automatically; PDFs and
images are inlined.

### Tests

```sh
python -m unittest discover -s tests
```

55 tests, no model calls and no network. They cover MIME guessing, YouTube URL
detection, state JSON rendering, schema leniency, stage wiring, upload
validation, and the whole retry/quota classification policy — including that a
failed run raises rather than returning an empty result. A failure therefore
points at our code rather than at Gemini. Live runs need a real API key.

## Run locally

1. Install Python 3.11 or newer (developed against 3.14).
2. In this directory, create an environment and install dependencies:

   ```sh
   python -m venv .venv
   source .venv/bin/activate       # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

   `python-multipart` is required by FastAPI for the `/ingest` form fields.

3. Copy `.env.example` to `.env` and add a Gemini API key from Google AI Studio.
   Keep `GOOGLE_GENAI_USE_VERTEXAI=FALSE` to stay on the Developer API.
4. Start the API:

   ```sh
   python server.py
   ```

   The health check is at `http://localhost:8000/health`. If that port is taken,
   set `PORT` in `.env` — a stale server on 8000 answers `404` to `/health`,
   which looks like a broken backend rather than the wrong process.

5. Copy `.env.example` to `StudyAthon/.env` and set
   `EXPO_PUBLIC_AGENT_API_URL=http://YOUR_COMPUTER_LAN_IP:8000` (use
   `http://localhost:8000` when running the app in a web browser on this computer).
   Restart Expo after changing its `.env` file. A physical phone needs the computer's
   reachable LAN IP and both devices on the same network.

The mobile app accepts the server URL as a public setting; never put `GOOGLE_API_KEY`
in the Expo app's `.env` file.

`load_dotenv()` searches upward from the script's own directory, so the server
finds `.env` no matter which directory you launch it from. It switches to the
*current* directory under a debugger or REPL though, so set the launch `cwd` to
this directory when debugging from an IDE.

## Customize the agent

Two agent graphs ship here. The study tutor lives in `study_buddy/agent.py`; the
ingestion agents live in `study_buddy/ingest/`, one file per stage. Change the
model or instruction, then add ADK tools in the `tools=[...]` argument.

The `server.py` endpoints are thin adapters between the app's HTTP request and
ADK's Python `Runner` API. The `/chat` adapter passes `{ "message": "..." }`
through as a single text part; the `/ingest` adapter converts form fields into
Gemini parts.

Knobs in `.env` are read once at import time by `study_buddy/settings.py`:

| Variable | Default | Effect |
| --- | --- | --- |
| `STUDYATHON_MODEL` | `gemini-3.8-flash` | Primary model for every stage. |
| `STUDYATHON_MODEL_FALLBACKS` | 3.8, 3.6, 3.5, 3.1-flash-lite | Tried in order when the primary fails. |
| `STUDYATHON_RETRY_ATTEMPTS` | `3` | Attempts per model before moving on. |
| `STUDYATHON_RETRY_BASE_DELAY` | `2.0` | Exponential backoff base, capped at 20s. |
| `STUDYATHON_QUESTIONS_PER_CONCEPT` | `2` | Questions generated per concept. |
| `STUDYATHON_MAX_CONCEPTS` | `40` | Ceiling on concepts per upload. |
| `STUDYATHON_WRITER_MAX_OUTPUT_TOKENS` | `65536` | Writer output budget; raise if long uploads truncate. |
| `PORT` | `8000` | FastAPI port. |

Sessions are in-memory and created per request, so each request is an
independent interaction and nothing is persisted between calls. Add a durable
session store and authentication before using this as a multi-user service.
Restrict CORS origins in `server.py` when deploying publicly — it currently
allows all origins for local Expo development.
