from google.adk.agents import Agent

from study_buddy.settings import resilient_model

root_agent = Agent(
    name="study_buddy",
    # Use the retry-and-fallback wrapper rather than a bare model name. The
    # Gemini free tier caps requests per day per model and returns 429 with a
    # multi-hour reset, which would otherwise fail every single /chat call.
    model=resilient_model(),
    description="A friendly AI study buddy that helps students learn and practice.",
    instruction=(
        "You are StudyAthon, a patient and encouraging study tutor. Explain ideas "
        "clearly, use examples, and help the student reason instead of simply doing "
        "their work for them. Adapt explanations to the student's level. When useful, "
        "ask one short follow-up question or offer a quick practice question."
    ),
    # Add ADK tools here as the agent grows, for example: tools=[my_tool].
)
