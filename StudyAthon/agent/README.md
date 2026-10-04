# StudyAthon ADK agent

This is a small Python backend for the Expo app. The app calls `/chat`, `/ingest`
and the `/study/*` loop; the Google ADK agents and Google API key stay on this
server.

## Endpoints

| Route | Purpose | Success | Client errors |
| --- | --- | --- | --- |
| `GET /health` | Liveness check. | `200` | — |
| `POST /chat` | The study tutor. JSON body `{"message": "..."}`. | `200` | `422` empty, `502` model failure |
| `POST /ingest` | Notes/PDF/slides/YouTube → validated MCQ bank. Multipart form. | `200` | `413` too large, `422` bad input, `502` model failure |
| `POST /study/session` | Material + settings → a playable first iteration. Multipart form. | `200` | `413`, `422`, `502` |
| `GET /study/session/{id}` | Resume a session after a reconnect. | `200` | `404` unknown |
| `POST /study/answer` | Record one answer; returns what to show next. | `200` | `404` unknown, `409` wrong state, `502` model |
| `POST /study/reveal` | Answer-reveal decision; returns the next iteration. | `200` | `404`, `409`, `502` |
| `POST /study/finish` | End a session early. | `200` | `404`, `409` |

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

138 tests, no model calls and no network. They cover MIME guessing, YouTube URL
detection, state JSON rendering, schema leniency, stage wiring, upload
validation, the whole retry/quota classification policy, every branch of the
study loop's transition rules, the session state machine, and the `/study/*`
HTTP contract. A failure therefore points at our code rather than at Gemini.
Both the loop rules and the session generator are stubbed in tests, so the suite
cannot accidentally spend quota. Live runs need a real API key.

## Study loop

The loop lives on the server, not in the app. The client answers questions and
renders what it is handed; it never decides what comes next. That keeps the
rules in one place — a client cannot implement them wrong — and means a session
survives an app reconnect.

One *iteration* is a full pass over the questions. When it ends:

| How the iteration went | What the next iteration contains |
| --- | --- |
| Every answered question correct | A brand-new question per concept, one tier harder |
| Some correct | Those questions rewritten, same difficulty |
| Some wrong, answers **declined** | Those questions re-asked **unchanged** |
| Some wrong, answers **accepted** | Those questions reworded, same difficulty |
| Never answered | Ignored — dropped, not carried forward |

Difficulty is tracked per question on a three-step ladder (`easy`, `medium`,
`hard`) and saturates at `hard`: a student who keeps clearing the set keeps
getting fresh questions at maximum difficulty rather than the loop ending.

### Flow

```
POST /study/session ──▶ first iteration (drawn from the ingested bank, no model call)
        │
        ├─ POST /study/answer ×N ──▶ next question …
        │
        ├─ all correct ────────────▶ harder set, loop continues
        │
        └─ something wrong ──▶ status "awaiting_reveal"
                                └─ POST /study/reveal ──▶ answers + next iteration

   timer expires (any request) ──▶ status "finished"
```

### Opening a session

`POST /study/session` takes the same multipart fields as `/ingest`, plus:

| Field | Meaning |
| --- | --- |
| `question_count` | Questions per iteration, clamped to 1–50. Omit to use the whole bank. |
| `timer_minutes` | Optional. Stored server-side; the countdown is for display only. |

It runs ingestion internally, so one call replaces chaining `/ingest` then
`/study/*`. The first iteration is sampled from the already-validated bank,
which is why opening a session costs no model calls beyond ingestion itself.

### Answering

`POST /study/answer` takes `{"session_id", "question_id", "selected_index"}`.
`selected_index` may be `null`, which records an explicit skip — a skipped
question is ignored rather than counted wrong.

The response is either the next question, or, on the last question of an
iteration, a `summary` with:

```json
{
  "iteration": 1, "correct": 2, "incorrect": 1, "unanswered": 1,
  "total": 4, "all_correct": false, "requires_reveal": true,
  "results": [{ "id": "q3", "stem": "…", "difficulty": "medium",
                "outcome": "incorrect", "selected_index": 0 }]
}
```

When `requires_reveal` is true, call `POST /study/reveal` with
`{"show_answers": true|false}`. Accepting returns the answers and explanations
in `answers` alongside the next iteration; declining returns `answers: null`.
`outcome` is one of `correct`, `incorrect`, `unanswered`.

### Two things the client must not rely on

**Answers are never sent with a question.** `correct_index`, `explanation` and
`evidence_quote` are stripped from every question that leaves the server — the
only sanctioned path is `rules.public_view`. Grade answers server-side.

**The timer is server-side.** The deadline is checked on every request, so
closing the app buys no extra time and a client that ignores the countdown is
still cut off. Use `seconds_remaining` for display and check `status` on resume.

### Cost

One model call per iteration that needs new questions — not one per question.
Declining the answers costs nothing, because unchanged questions are
replayed rather than regenerated. See *Free-tier quota* above.

## Run locally

1. Install Python 3.11 or newer (developed against 3.14).
2. From the `StudyAthon` directory, activate the project environment and install dependencies:

   ```sh
   source .venv/bin/activate       # Windows: .venv\Scripts\activate
   python -m pip install -r agent/requirements.txt
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

5. Set `EXPO_PUBLIC_AGENT_API_URL=http://localhost:8000` in `StudyAthon/.env`.
   The client uses Expo's development host for physical devices and Android's
   emulator host alias when needed. For a release build or a custom network, set
   this variable to a backend URL reachable from that device. Restart Expo after
   changing `.env` with `npx expo start -c`.

### Deploying the web app

The FastAPI service must be deployed separately from the static Expo web app.
Give the API a public HTTPS URL and confirm its `/health` route returns
`{"status":"ok"}`. Set `EXPO_PUBLIC_AGENT_API_URL` to that HTTPS base URL in the
web build environment **before** building/exporting the web app; the value is
embedded in the JavaScript bundle at build time. Do not use `localhost` for a
deployed site, and never put `GOOGLE_API_KEY` in an `EXPO_PUBLIC_*` variable.
Rebuild and redeploy the web app after changing this value.

The mobile app accepts the server URL as a public setting; never put `GOOGLE_API_KEY`
in the Expo app's `.env` file.

`load_dotenv()` searches upward from the script's own directory, so the server
finds `agent/.env` no matter which directory you launch it from. It switches to
the *current* directory under a debugger or REPL though, so set the launch `cwd`
to `agent/` when debugging from an IDE.

## Customize the agent

The chat tutor used by the app lives in `study_buddy/agent.py`. Its instructions
are to answer the student's question first, adapt to their level, explain the
reasoning, use supplied study material as the source of truth, and be clear about
uncertainty. It should guide problem solving and correct misunderstandings kindly,
without claiming to launch app features. The Expo home screen calls `/chat`
through `services/agent.ts` and displays the tutor's reply. Quiz creation and its
rules stay in the separate `/study/*` flow. The ingestion agents live in
`study_buddy/ingest/`, one file per stage. Change the model or instruction, then
add ADK tools in the `tools=[...]` argument.

The `server.py` endpoints are thin adapters between the app's HTTP request and
ADK's Python `Runner` API. The `/chat` adapter passes `{ "message": "..." }`
through as a single text part; the `/ingest` adapter converts form fields into
Gemini parts.

Knobs in `.env` are read once at import time by `study_buddy/settings.py`:

| Variable | Default | Effect |
| --- | --- | --- |
| `STUDYATHON_MODEL` | `gemini-3.8-flash` | Primary model for every stage. |
| `STUDYATHON_MODEL_FALLBACKS` | 3.8, 3.6, 3.5, 3.5-flash-lite | Tried in order when the primary fails. |
| `STUDYATHON_RETRY_ATTEMPTS` | `3` | Attempts per model before moving on. |
| `STUDYATHON_RETRY_BASE_DELAY` | `2.0` | Exponential backoff base, capped at 20s. |
| `STUDYATHON_QUESTIONS_PER_CONCEPT` | `2` | Questions generated per concept. |
| `STUDYATHON_MAX_CONCEPTS` | `40` | Ceiling on concepts per upload. |
| `STUDYATHON_WRITER_MAX_OUTPUT_TOKENS` | `65536` | Writer output budget; raise if long uploads truncate. |
| `PORT` | `8000` | FastAPI port. |

Chat sessions are created per request. Study-loop sessions are held in the
backend process memory for up to six hours of inactivity. Restarting the backend
clears them, so keep the process running for the duration of a study session.
Run one backend process for local use; multiple workers or replicas need a
shared durable session store before they can safely serve the same session.
Restrict CORS origins in `server.py` when deploying publicly — it currently
allows all origins for local Expo development.
