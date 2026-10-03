import os
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

load_dotenv()

from study_buddy.agent import root_agent

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
