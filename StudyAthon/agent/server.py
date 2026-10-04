import os
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

load_dotenv()

from study_buddy.agent import root_agent
from study_buddy.ingest.runner import IngestResult, build_parts, run_ingestion
from study_buddy.resilient import InvalidRequestError
from study_buddy.study import session as study_session
from study_buddy.study.rules import public_views
from study_buddy.study.session import SessionError, UnknownSession

# Inline request bodies are capped so a mistaken multi-file upload cannot push a
# multi-megabyte payload through the Gemini request. Uploaded study material is
# normally well under this.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

APP_NAME = "study_buddy"
session_service = InMemorySessionService()
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
)

app = FastAPI(title="StudyAthon ADK API")

# Open CORS is convenient for local Expo development. Restrict this to your app's
# domain before deploying the API publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    reply: str


class IngestResponse(BaseModel):
    questions: list[dict]
    rejected: list[dict]
    coverage_gaps: list[str]
    concepts: list[dict]
    source_notes: dict


class AnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    #: ``None`` is an explicit skip, which the loop ignores rather than counting
    #: as a wrong answer.
    selected_index: int | None = None


class RevealRequest(BaseModel):
    session_id: str = Field(min_length=1)
    show_answers: bool


class SessionRef(BaseModel):
    session_id: str = Field(min_length=1)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    user_id = "studyathon-user"
    session_id = str(uuid4())

    await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )

    try:
        final_text = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text=request.message)],
            ),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = "\n".join(
                    part.text for part in event.content.parts if part.text
                )

        if not final_text:
            raise HTTPException(status_code=502, detail="The agent returned an empty response.")
        return ChatResponse(reply=final_text)
    except HTTPException:
        raise
    except Exception as error:
        # Avoid returning provider credentials or internal traces to the client.
        print(f"ADK request failed: {error}")
        raise HTTPException(status_code=502, detail="The study agent failed to respond.") from error


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    text: str | None = Form(default=None),
    urls: list[str] = Form(default_factory=list),
    files: list[UploadFile] = File(default_factory=list),
) -> IngestResponse:
    """Turn raw study material into a validated multiple-choice question bank.

    Multipart form fields, so one request can carry pasted notes, a lecture URL,
    and a photo of a whiteboard together. The mobile client sends a FormData
    body. At least one of the three fields must be non-empty.

    Runs four model calls in sequence, so this is slow by design (tens of
    seconds). It is a batch operation, not something to call on a keystroke.
    """
    uploads: list[tuple[str, bytes, str | None]] = []
    for upload in files:
        data = await upload.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename or 'file'} exceeds the upload size limit.",
            )
        uploads.append((upload.filename or "upload", data, upload.content_type))

    try:
        parts = build_parts(text=text, urls=urls, files=uploads)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        result: IngestResult = await run_ingestion(parts)
    except InvalidRequestError as error:
        # Every model rejected the payload, so the upload is the problem.
        print(f"Ingestion input rejected: {error}")
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        # Avoid returning provider credentials or internal traces to the client.
        print(f"Ingestion failed: {error}")
        raise HTTPException(
            status_code=502, detail="Ingestion failed to produce a question bank."
        ) from error

    bank = result.question_bank
    return IngestResponse(
        questions=bank.get("approved") or [],
        rejected=bank.get("rejected") or [],
        coverage_gaps=bank.get("coverage_gaps") or [],
        concepts=result.concepts,
        source_notes=result.source_notes,
    )


# --------------------------------------------------------------------------
# Study loop
#
# The loop lives here rather than in the client so a UI cannot implement it
# wrong: the server decides what each question becomes next iteration, enforces
# the timer, and never sends ``correct_index`` or ``explanation`` with a
# question. The client answers questions and renders what it is handed.
# --------------------------------------------------------------------------


def _study_state(session: study_session.StudySession) -> dict:
    """A session's full public state. Safe to hand to any client."""
    state = {
        "session_id": session.session_id,
        "iteration": session.iteration,
        "status": session.status,
        "finished_reason": session.finished_reason,
        "total_questions": len(session.questions),
        "seconds_remaining": session.seconds_remaining(),
        "questions": public_views(session.questions),
    }

    # A session closed part-way through an iteration still owes the student a
    # recap. The timer can fire between two answers, and nothing else would ever
    # report what they got wrong, so the explanations would simply be lost.
    # answers_payload only carries questions that were actually wrong: a skipped
    # question is ignored by the loop, so grading it would invent a failure the
    # student never committed.
    if session.status == study_session.STATUS_FINISHED:
        state["summary"] = session.summary()
        state["answers"] = session.answers_payload()

    return state


def _session_error(error: SessionError) -> HTTPException:
    """404 for a session that is gone, 409 for one in the wrong state."""
    status = 404 if isinstance(error, UnknownSession) else 409
    return HTTPException(status_code=status, detail=str(error))


@app.post("/study/session")
async def create_study_session(
    text: str | None = Form(default=None),
    urls: list[str] = Form(default_factory=list),
    files: list[UploadFile] = File(default_factory=list),
    question_count: int | None = Form(default=None),
    timer_minutes: int | None = Form(default=None),
) -> dict:
    """Open a study session and return its first iteration.

    Runs the same ingestion pipeline as ``/ingest`` internally and seeds the first
    iteration from the validated bank, so the client makes one call instead of
    chaining two. That first iteration therefore costs no model calls beyond
    ingestion itself.

    ``question_count`` is clamped to 1-50. ``timer_minutes`` is optional; when
    given, the deadline is stored server-side so a client that ignores the
    countdown still cannot answer past it.

    Slow by design: ingestion is four sequential model calls, tens of seconds.
    """
    uploads: list[tuple[str, bytes, str | None]] = []
    for upload in files:
        data = await upload.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename or 'file'} exceeds the upload size limit.",
            )
        uploads.append((upload.filename or "upload", data, upload.content_type))

    try:
        parts = build_parts(text=text, urls=urls, files=uploads)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    session_id = str(uuid4())
    # A distinct ADK user per session keeps concurrent study sessions from
    # sharing ingestion session state.
    try:
        result = await run_ingestion(parts, user_id=f"study-{session_id}")
        session = await study_session.create(
            session_id=session_id,
            user_id=f"study-{session_id}",
            approved=result.approved,
            concepts=result.concepts,
            source_notes=result.source_notes,
            requested_count=question_count,
            timer_seconds=timer_minutes * 60 if timer_minutes else None,
        )
    except InvalidRequestError as error:
        print(f"Study session input rejected: {error}")
        raise HTTPException(status_code=422, detail=str(error)) from error
    except SessionError as error:
        raise _session_error(error) from error
    except Exception as error:
        print(f"Study session creation failed: {error}")
        raise HTTPException(
            status_code=502, detail="Could not build a study session from this material."
        ) from error

    return _study_state(session)


@app.get("/study/session/{session_id}")
async def get_study_session(session_id: str) -> dict:
    """Resume a session after the app reconnects.

    Applying the timer is a side effect of this call, so a student whose deadline
    passed while the app was closed gets the finished session rather than a
    question they can no longer answer.
    """
    try:
        session = await study_session.get(session_id)
    except SessionError as error:
        raise _session_error(error) from error
    return _study_state(session)


@app.post("/study/answer")
async def answer_study_question(request: AnswerRequest) -> dict:
    """Record one answer and return whatever the client should show next.

    Usually the next question. On the last question of an iteration the response
    carries ``summary`` instead: either the loop escalated straight into a harder
    set, or ``requires_reveal`` is true and the client must ask whether the
    student wants to see the answers before calling ``/study/reveal``.
    """
    try:
        return await study_session.record_answer(
            request.session_id, request.question_id, request.selected_index
        )
    except SessionError as error:
        raise _session_error(error) from error
    except Exception as error:
        # The next iteration is model-backed, so this is where provider failures
        # surface. The student keeps their answers and can retry.
        print(f"Study answer failed: {error}")
        raise HTTPException(
            status_code=502, detail="Could not build the next set of questions."
        ) from error


@app.post("/study/reveal")
async def reveal_study_answers(request: RevealRequest) -> dict:
    """Record the answer-reveal decision and return the next iteration.

    Answering wrong asks for one decision per iteration. Declining re-asks the
    identical questions at no quota cost; accepting returns the answers and
    explanations and reworded versions of the questions next iteration.
    """
    try:
        return await study_session.submit_reveal(
            request.session_id, request.show_answers
        )
    except SessionError as error:
        raise _session_error(error) from error
    except Exception as error:
        print(f"Study reveal failed: {error}")
        raise HTTPException(
            status_code=502, detail="Could not build the next set of questions."
        ) from error


@app.post("/study/finish")
async def finish_study_session(request: SessionRef) -> dict:
    """End a session early, at the student's request."""
    try:
        return await study_session.finish(request.session_id)
    except SessionError as error:
        raise _session_error(error) from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        # Reloading replaces the process and clears the in-memory study-session
        # store. Enable it explicitly during development with STUDYATHON_RELOAD=1.
        reload=os.getenv("STUDYATHON_RELOAD", "0").lower() in {"1", "true", "yes"},
    )
