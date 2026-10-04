# hackDearborn-5

Repo for the best team at Hack Dearborn 5

---

## StudyAthon

StudyAthon turns a student's own material into a quiz that adapts to them.
Agents take in study notes, lecture slides, and recordings, write multiple-choice
questions grounded in that material, then quiz the student one question at a
time. Wrong answers send the concept back around the loop. When an answer comes
back correct, the question and answer are rephrased and re-queued, so the loop
tightens around what the student actually gets wrong instead of replaying a
static deck.

## The loop

| Stage | What it does | Status |
| --- | --- | --- |
| **Ingest** | Notes, PDFs, slide photos, or a lecture link → grounded MCQ bank | Done |
| **Quiz** | One question at a time until every answer is correct | Next |
| **Rephrase** | On a correct answer, rewrite the Q&A and put it back in the loop | Next |

Ingestion is deliberately strict about grounding. Every concept carries a
verbatim quote from the source, and a validator stage drops any question the
source does not support or where more than one option is defensible. A student
should never be told they were wrong because the model invented a fact.

## Layout

| Path | What it is |
| --- | --- |
| `StudyAthon/` | Expo app — SDK 57, Expo Router, Firebase for auth and storage |
| `StudyAthon/agent/` | Python backend — FastAPI + Google ADK, holds the Gemini API key |
| `StudyAthon/AGENTS.md` | Conventions for the Expo side; read before touching it |

The app never talks to Google directly. It calls the Python backend, which keeps
the API key server-side and owns all the agent logic.

## Running it

Backend:

```sh
cd StudyAthon/agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add a Gemini API key from Google AI Studio
python server.py            # http://localhost:8000/health
```

App:

```sh
cd StudyAthon
cp .env.example .env        # set EXPO_PUBLIC_AGENT_API_URL to match the backend
npx expo start -c           # restart with -c after editing .env
```

If port 8000 is taken, change `PORT` in `StudyAthon/agent/.env` and `EXPO_PUBLIC_AGENT_API_URL` in `StudyAthon/.env` to the same value. For full setup and troubleshooting, see `StudyAthon/AGENTS.md`.

`StudyAthon/agent/README.md` has the endpoint reference, the ingestion agent
graph, and the tuning knobs.

## Things worth knowing

- **The Gemini free tier is the binding constraint.** It allows 20 requests per
  day per model, and one ingestion run costs 4 requests — about 5 ingestions per
  model per day. Turn on billing before the demo, or runs will fail in ways that
  look like bugs.
- **Ingestion is slow by nature.** Four model calls run in sequence; expect
  minutes, not seconds. It is a batch job triggered by an upload, not something
  to call on every keystroke.
- **Ingested questions are not persisted yet.** The backend holds sessions in
  memory for the duration of one request. Wiring the question bank into Firebase
  is part of the Quiz stage.