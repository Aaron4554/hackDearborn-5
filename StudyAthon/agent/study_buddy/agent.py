import os

from google.adk.agents import Agent


root_agent = Agent(
    name="study_buddy",
    model=os.getenv("STUDYATHON_MODEL", "gemini-3.8-flash"),
    description="A friendly AI study buddy that helps students learn and practice.",
    instruction=(
        "You are StudyAthon, a patient and encouraging study tutor. Explain ideas "
        "clearly, use examples, and help the student reason instead of simply doing "
        "their work for them. Adapt explanations to the student's level. When useful, "
        "ask one short follow-up question or offer a quick practice question."
    ),
    # Add ADK tools here as the agent grows, for example: tools=[my_tool].
)
