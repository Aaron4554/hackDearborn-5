# StudyAthon ADK agent

This is a small Python backend for the Expo app. The app calls `/chat` and
`/ingest`; the Google ADK agents and Google API key stay on this server.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness check. |
| `POST /chat` | The study tutor. JSON body `{"message": "..."}`. |
| `POST /ingest` | Notes/PDF/slides/YouTube → validated MCQ bank. Multipart form. |

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

### Model availability

`gemini-3.8-flash` returns `503 UNAVAILABLE ... high demand` intermittently, and
a single 503 would otherwise kill an entire four-stage run. `ResilientGemini`
wraps each model call to retry with exponential backoff, then try the next
candidate.

Two subtleties it handles:

- `models.list()` is not an availability signal. `gemini-2.5-flash` and
  `gemini-3.1-flash` both appeared in the listing but returned 404 on
  `generate_content`.
- A 429 is not always retryable. The Gemini free tier caps
  `generate_content_free_tier_requests` per day, per model, and reports a wait
  measured in hours (`retryDelay: "16531s"`). Retrying that with backoff just
  burns time, so a multi-hour `RetryInfo` is classified as "try a different
  model" instead.

### Free-tier quota

The free tier allows **20 requests per day per model**, and one ingestion run
makes **4 requests**. That is roughly 5 ingestions per model per day, or ~20 per
day across the four-model fallback chain. A full run takes 3-4 minutes. For
repeated testing, enable billing.

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

Response fields: `questions` (approved), `rejected`, `coverage_gaps`, `concepts`,
`source_notes`.

This is four sequential model calls, so expect tens of seconds. It is a batch
operation, not something to call on a keystroke.

### Without the server

```sh
python ingest_notes.py fixtures/sample_notes.txt
python ingest_notes.py --url https://youtu.be/dQw4w9WgXcQ --json
```

### Tests

```sh
python -m unittest discover -s tests
```

The tests cover the model-free logic (MIME guessing, YouTube URL detection, state
JSON rendering, schema leniency, stage wiring) so a failure points at our code
rather than at Gemini. A live run needs a real API key.

## Run locally

1. Install Python 3.11 or newer.
2. In this directory, create an environment and install dependencies:

   ```sh
   python -m venv .venv
   source .venv/bin/activate       # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and add a Gemini API key from Google AI Studio.
4. Start the API:

   ```sh
   python server.py
   ```

   The health check is at `http://localhost:8000/health`.

5. Copy `.env.example` to `StudyAthon/.env` and set
   `EXPO_PUBLIC_AGENT_API_URL=http://YOUR_COMPUTER_LAN_IP:8000` (use
   `http://localhost:8000` when running the app in a web browser on this computer).
   Restart Expo after changing its `.env` file. A physical phone needs the computer's
   reachable LAN IP and both devices on the same network.

The mobile app accepts the server URL as a public setting; never put `GOOGLE_API_KEY`
in the Expo app's `.env` file.

## Customize the agent

Two agents ship here. The study tutor lives in `study_buddy/agent.py`; the
ingestion agents live in `study_buddy/ingest/`, one file per stage. Change the
model or instruction, then add ADK tools in the `tools=[...]` argument.

The `server.py` endpoints are thin adapters between the app's HTTP request and
ADK's Python `Runner` API. The `/chat` adapter passes `{ "message": "..." }`
through as a single text part; the `/ingest` adapter converts form fields into
Gemini parts.

Knobs in `.env` (`STUDYATHON_MODEL`, `STUDYATHON_QUESTIONS_PER_CONCEPT`,
`STUDYATHON_MAX_CONCEPTS`, `STUDYATHON_WRITER_MAX_OUTPUT_TOKENS`) are read once at
import time by `study_buddy/settings.py`.

The included in-memory sessions are created per request, so each prompt is an
independent interaction. Add persistent session storage and authentication before
using this as a multi-user production service. Restrict CORS origins in `server.py`
when deploying publicly.
