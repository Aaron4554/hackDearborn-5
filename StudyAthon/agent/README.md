# StudyAthon ADK agent

This is a small Python backend for the Expo app. The app calls `/chat`; the Google
ADK agent and Google API key stay on this server.

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

Edit `study_buddy/agent.py`. Change the model or instruction, then add ADK tools in
the `tools=[...]` argument. The `server.py` `/chat` endpoint is the small adapter
between the app's `{ "message": "..." }` request and ADK's Python `Runner` API.

The included in-memory sessions are created per request, so each prompt is an
independent interaction. Add persistent session storage and authentication before
using this as a multi-user production service. Restrict CORS origins in `server.py`
when deploying publicly.
