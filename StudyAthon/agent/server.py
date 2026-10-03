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
    allow_methods=["POST", "OPTIONS"],
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
