## First run from a clean clone

This app is **not** self-contained. The AI lives in a separate FastAPI service under `agent/`; without it, chat and the study loop do nothing. Two `.env` files are required, and `.venv/` and `node_modules/` are both gitignored, so a fresh clone starts with neither.

**1. Backend** (from `agent/`):

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then set GOOGLE_API_KEY
python server.py
```

`GOOGLE_API_KEY` is the only value you must set; every other key in `.env.example` has a working default. Use `python server.py`, not a bare `uvicorn --port`, because the port comes from `PORT` in `.env` (`server.py:355`) and a command-line `--port` silently overrides it.

Check it: `curl http://localhost:8000/health` → `{"status":"ok"}`.

**2. Frontend** (from the repo's `StudyAthon/`):

```bash
npm install
cp .env.example .env             # then set EXPO_PUBLIC_AGENT_API_URL
npx expo start -c
```

`EXPO_PUBLIC_AGENT_API_URL` is not an Expo built-in; it is a custom variable this repo uses. Expo inlines `EXPO_PUBLIC_*` into the client bundle at build time, so editing `.env` without the `-c` restart keeps the old value and the failure looks like a dead server. Never put a secret in it — the backend key lives in `agent/.env`.

| Running the app on | Value |
| --- | --- |
| Web / iOS Simulator | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Physical phone | `http://<your-LAN-IP>:8000`, same Wi-Fi, backend bound to `0.0.0.0` |

**If port 8000 is already taken**, change `PORT` in `agent/.env` *and* `EXPO_PUBLIC_AGENT_API_URL` to match. Editing one alone is the single most common way to end up with a backend and frontend on different ports.

**3. Firebase.** `firebaseConfig.ts` is hardcoded to the `studyathon-5d4f7` project, so there is nothing to configure — but two things must already be true in that project:

- Email/Password sign-in is enabled in the Firebase console, or sign-up fails.
- `firestore.rules` (committed here) is deployed via `firebase deploy --only firestore:rules`, or the project is still in test mode. The rules validate an exact key set on profile creation, so a mismatch blocks onboarding rather than failing loudly.

**4. First launch expectations.** A new account is not signed in until it clears a two-step wizard: username + four-digit tag, then personal details. Only after that does `app/index.tsx` route into the tabs, and the Study loop is reachable. Being stuck on that wizard is the gate working, not a bug.

**5. Verify the whole thing.**

```bash
curl http://localhost:8000/health
cd agent && python -m unittest discover -s tests   # 140 tests, model-free
cd .. && npx tsc --noEmit && npx expo lint
```

**Known limit:** the Gemini free tier allows ~20 requests/day shared across all models, and one ingestion burns about four. Study-session creation will start returning `502` with "out of model quota" once that is gone; the app surfaces this rather than hanging. Budget for it before a demo.

### Talking to the backend

Never call `fetch` from a screen. `services/agent.ts` is the only place that knows the wire format, and it throws `AgentError` with a message already fit to show a student.

- `chat(message)` → the free-form study buddy on the home screen.
- `createStudySession` / `resumeStudySession` / `answerStudyQuestion` / `revealStudyAnswers` / `finishStudySession` → the study loop, driven by `contexts/StudyContext.tsx` across the `app/study/` routes.

The backend owns every loop rule: what a question becomes next iteration, the timer, and grading. Do not re-derive any of it on the client. In particular questions arrive **without** `correct_index`/`explanation`, and a `null` `selected_index` is a skip that the loop ignores rather than a wrong answer. See `agent/README.md` for the endpoints.