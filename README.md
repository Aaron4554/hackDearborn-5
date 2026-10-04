# HackDearborn-5

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
| **Quiz** | One question at a time until every answer is correct | Done |
| **Rephrase** | On a correct answer, rewrite the Q&A and put it back in the loop | Done |

The client for the loop lives in `StudyAthon/app/study/` and is driven by
`contexts/StudyContext.tsx`. The server decides what each question becomes next
iteration; the app only renders what it is handed. Note that the third stage is
called **Rephrase** here but `REWORD` in `study_buddy/study/rules.py`.

Ingestion is deliberately strict about grounding. Every concept carries a
verbatim quote from the source, and a validator stage drops any question the
source does not support or where more than one option is defensible. A student
should never be told they were wrong because the model invented a fact.

## Theming

The app ships a light and a dark scheme. Colours live in
`StudyAthon/constants/theme.ts` as 37 named tokens with a value per scheme, and
`contexts/ThemeContext.tsx` exposes the resolved set.

```tsx
const theme = useTheme();                    // the tokens for the active scheme
const styles = useMemo(() => buildStyles(theme), [theme]);
```

Two conventions matter when touching a screen:

- **Never hardcode a colour.** No hex or `rgba()` in a stylesheet — those are
  easy to miss because they read fine in whichever scheme you happen to have
  open, and they silently fail to invert in the other one.
- **Build styles per render**, via a `buildStyles(theme)` factory, because
  `StyleSheet.create` is module scope and has no access to the theme. Colours
  that describe data rather than chrome — module-level lookup tables — have to
  become functions of the theme for the same reason.

The tab dock deliberately inverts against the page (dark on light, light on
dark) and has its own `dock*` tokens, since it is the one element that always
sits on the opposite surface from the content.

The preference defaults to following the system and is persisted to
AsyncStorage under `studyathon.color-scheme`; the picker lives in Settings →
Appearance. Text/background pairings are checked against WCAG AA per pairing in
both schemes rather than by eye.

## Layout

| Path | What it is |
| --- | --- |
| `StudyAthon/` | Expo app — SDK 57, Expo Router, Firebase for auth and storage |
| `StudyAthon/agent/` | Python backend — FastAPI + Google ADK, holds the Gemini API key |
| `StudyAthon/docs/diagrams/` | Sequence and state diagrams for ingestion and the study loop |
| `StudyAthon/AGENTS.md` | Conventions for the Expo side; read before touching it |

The app never talks to Google directly. It calls the Python backend, which keeps
the API key server-side and owns all the agent logic.

## Running it

Backend:

```sh
cd StudyAthon/agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add a Gemini API key from Google AI Studio
python3 server.py            # http://localhost:8000/health
```

App:

```sh
cd StudyAthon
cp .env.example .env        # set EXPO_PUBLIC_AGENT_API_URL to match the backend
npm install                 # install node.js dependencies
npx expo start -c           # restart with -c after editing .env
```

If port 8000 is taken, change `PORT` in `StudyAthon/agent/.env` and `EXPO_PUBLIC_AGENT_API_URL` in `StudyAthon/.env` to the same value. For full setup and troubleshooting, see `StudyAthon/AGENTS.md`.

`StudyAthon/agent/README.md` has the endpoint reference, the ingestion agent
graph, and the tuning knobs. `StudyAthon/docs/diagrams/` has two diagrams worth
reading before changing the backend: how ingestion spends its four model calls,
and the study session state machine.

## Things worth knowing

- **The Gemini free tier is the binding constraint.** It allows 20 requests per
  day per model, and one ingestion run costs 4 requests — about 5 ingestions per
  model per day. Turn on billing before the demo, or runs will fail in ways that
  look like bugs.
- **Ingestion is slow by nature.** Four model calls run in sequence; expect
  minutes, not seconds. It is a batch job triggered by an upload, not something
  to call on every keystroke.
- **Ingested questions are not persisted yet.** The backend holds sessions in
  memory (`InMemorySessionService`), so a question bank lives only as long as the
  process. A student who ingests the same notes twice pays for it twice, and a
  session cannot be resumed after a backend restart. Writing the bank to
  Firebase is still open work, and it sits outside the stages above.
