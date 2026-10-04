import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Typed client for the StudyAthon ADK backend.
 *
 * The backend owns the study loop: it decides what each question becomes next
 * iteration, enforces the timer, and grades answers. This module only speaks the
 * wire format, so nothing here re-implements a loop rule.
 *
 * One contract worth keeping: questions arrive without `correct_index`,
 * `explanation`, or `evidence_quote`. The server strips them, so a client cannot
 * grade its own homework and nothing needs to hide them here.
 */

export type QuestionOutcome = 'correct' | 'incorrect' | 'unanswered';

export type SessionStatus = 'active' | 'awaiting_reveal' | 'finished';

/** A question as the student sees it. Deliberately no `correct_index`. */
export type PublicQuestion = {
  id: string;
  concept_id: string;
  stem: string;
  options: string[];
  difficulty: string;
};

/** Only ever returned by `/study/reveal` with `show_answers: true`. */
export type AnswerKey = {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export type IterationSummary = {
  iteration: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  all_correct: boolean;
  requires_reveal: boolean;
  results: {
    id: string;
    stem: string;
    difficulty: string;
    outcome: QuestionOutcome;
    selected_index: number | null;
  }[];
};

export type StudyState = {
  session_id: string;
  iteration: number;
  status: SessionStatus;
  finished_reason: string | null;
  total_questions: number;
  seconds_remaining: number | null;
  questions: PublicQuestion[];
  /** Present only once the session is over, so the recap survives a timer expiry. */
  summary?: IterationSummary;
  /** Wrong questions only, on a session that has finished. */
  answers?: AnswerKey[];
};

/** Returned by `/study/answer` and `/study/reveal`. */
export type AdvanceResponse = {
  session_id: string;
  iteration: number;
  status: SessionStatus;
  question: PublicQuestion | null;
  iteration_complete: boolean;
  summary?: IterationSummary;
  answers: AnswerKey[] | null;
  questions?: PublicQuestion[];
  finished_reason?: string | null;
};

export type StudySessionRequest = {
  text?: string;
  urls?: string[];
  questionCount?: number;
  timerMinutes?: number | null;
  educationLevel?: string;
  gradeLevel?: string | null;
  takesAdvancedClasses?: boolean | null;
};

export type NotesChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type GeneratedStudyGameSet = {
  title: string;
  key_terms: { term: string; definition: string }[];
  questions: { question: string; options: string[]; correct_index: number; explanation: string }[];
};

export type FinishResponse = {
  session_id: string;
  iteration: number;
  status: SessionStatus;
  finished_reason: string | null;
  seconds_remaining: number | null;
  summary: IterationSummary;
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint?: string;
};

export type FlashcardDeck = {
  topic: string;
  cards: Flashcard[];
};

export type FlashcardRequest = {
  topic?: string;
  text?: string;
  count?: number;
};

export class AgentError extends Error {
  /** The HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AgentError';
    this.status = status;
  }

  /** A dead backend is a different problem from a rejected request. */
  get isOffline(): boolean {
    return this.status === 0;
  }

  get isMissingConfig(): boolean {
    return this.status === -1;
  }
}

/**
 * Base URL of the running backend, from `EXPO_PUBLIC_AGENT_API_URL`.
 *
 * Expo inlines `EXPO_PUBLIC_*` at bundle time, so this is a literal string in
 * the shipped app. Throws `AgentError` with status -1 when unset, which is a
 * distinct case worth its own message: no `.env`, not a broken server.
 */
export function agentUrl(): string {
  const raw = process.env.EXPO_PUBLIC_AGENT_API_URL?.trim();
  if (!raw) {
    throw new AgentError(
      'EXPO_PUBLIC_AGENT_API_URL is not set. Copy .env.example to .env and restart with `npx expo start -c`.',
      -1,
    );
  }
  const url = new URL(raw);

  if (!__DEV__ && isLoopback(url.hostname)) {
    throw new AgentError(
      'This deployed app is configured with localhost. Deploy the FastAPI backend, then set EXPO_PUBLIC_AGENT_API_URL to its public HTTPS URL and rebuild the web app.',
      -1,
    );
  }

  // Expo's development host is reachable from a physical phone on the same
  // Wi-Fi, while localhost/127.0.0.1 always points back to the phone itself.
  // Keep the backend port from the configured URL and borrow only the host.
  if (__DEV__ && Platform.OS !== 'web' && isLoopback(url.hostname)) {
    const expoHost = Constants.expoConfig?.hostUri;
    if (expoHost) {
      const hostname = new URL(`http://${expoHost}`).hostname;
      if (!isLoopback(hostname)) {
        url.hostname = hostname;
      } else if (Platform.OS === 'android') {
        url.hostname = '10.0.2.2';
      }
    } else if (Platform.OS === 'android') {
      // Android emulator's special alias for the host computer.
      url.hostname = '10.0.2.2';
    }
  }

  return url.toString().replace(/\/+$/, '');
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

/**
 * POST JSON and surface a useful message on failure.
 *
 * FastAPI puts the human-readable reason in `detail`, but a proxy or a crashed
 * worker answers with HTML or nothing at all, so the body is parsed defensively
 * and never allowed to throw on its own.
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${agentUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AgentError(
      `Could not reach the study backend at ${url}. Start the backend and make sure this device can reach that address.`,
    );
  }

  const data = await readBody(response);
  if (!response.ok) {
    throw new AgentError(detailOf(data) ?? defaultFor(response.status), response.status);
  }
  return data as T;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function detailOf(data: unknown): string | null {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // FastAPI validation errors arrive as a list of objects.
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === 'string') return first.msg;
    }
  }
  return null;
}

function defaultFor(status: number): string {
  switch (status) {
    case 404:
      return 'The backend returned 404. Check that the app points to the StudyAthon API and that this study session still exists.';
    case 409:
      return 'That action does not fit the session\'s current state.';
    case 413:
      return 'That file is too large.';
    case 422:
      return 'That request was not valid.';
    case 502:
      return 'The study backend could not produce an answer. It may be out of model quota.';
    default:
      return 'The study backend returned an unexpected error.';
  }
}

/** Ask the study tutor a free-form question. */
export async function chat(message: string): Promise<string> {
  const data = await postJson<{ reply?: string }>('/chat', { message });
  return data?.reply ?? '';
}

/** Ask a follow-up using the generated notes and recent discussion as context. */
export async function chatAboutNotes(
  notes: string,
  question: string,
  history: NotesChatMessage[],
): Promise<string> {
  const data = await postJson<{ reply?: string }>('/notes-chat', {
    notes,
    question,
    history: history.slice(-10),
  });
  return data?.reply ?? '';
}

/** Generate a deck of AI flashcards from a topic or notes. */
export async function generateFlashcards(request: FlashcardRequest): Promise<FlashcardDeck> {
  return postJson<FlashcardDeck>('/flashcards', {
    topic: request.topic?.trim() || undefined,
    text: request.text?.trim() || undefined,
    count: request.count ?? 8,
  });
}

/**
 * Open a study session and return its first iteration.
 *
 * Multipart because the same request can carry pasted notes, a link, and an
 * uploaded file together. This runs ingestion on the server, so it is slow by
 * design — tens of seconds across four model calls. Never call it on a render.
 */
export async function createStudySession(request: StudySessionRequest, signal?: AbortSignal): Promise<StudyState> {
  const url = `${agentUrl()}/study/session`;
  const form = new FormData();

  if (request.text?.trim()) form.append('text', request.text.trim());
  for (const link of request.urls ?? []) {
    if (link.trim()) form.append('urls', link.trim());
  }
  if (request.questionCount != null) {
    form.append('question_count', String(request.questionCount));
  }
  if (request.timerMinutes) form.append('timer_minutes', String(request.timerMinutes));
  if (request.educationLevel) form.append('education_level', request.educationLevel);
  if (request.gradeLevel) form.append('grade_level', request.gradeLevel);
  if (request.takesAdvancedClasses != null) form.append('takes_advanced_classes', String(request.takesAdvancedClasses));

  let response: Response;
  try {
    // No Content-Type header: fetch must set the multipart boundary itself.
    response = await fetch(url, { method: 'POST', body: form, signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AgentError(
      `Could not reach the study backend at ${url}. Start the backend and make sure this device can reach that address.`,
    );
  }

  const data = await readBody(response);
  if (!response.ok) {
    throw new AgentError(detailOf(data) ?? defaultFor(response.status), response.status);
  }
  return data as StudyState;
}

/** Reuse the grounded note-ingestion pipeline to build content for both game modes. */
export async function generateStudyGameSet(
  text: string,
  learner?: { educationLevel?: string; gradeLevel?: string | null; takesAdvancedClasses?: boolean | null },
): Promise<GeneratedStudyGameSet> {
  const url = `${agentUrl()}/ingest`;
  const form = new FormData();
  form.append('text', text.trim());
  form.append('question_count', '8');
  if (learner?.educationLevel) form.append('education_level', learner.educationLevel);
  if (learner?.gradeLevel) form.append('grade_level', learner.gradeLevel);
  if (learner?.takesAdvancedClasses != null) form.append('takes_advanced_classes', String(learner.takesAdvancedClasses));
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form });
  } catch {
    throw new AgentError(`Could not reach the study backend at ${url}.`);
  }
  const data = await readBody(response);
  if (!response.ok) throw new AgentError(detailOf(data) ?? defaultFor(response.status), response.status);

  const payload = data as {
    concepts?: { topic?: string; statement?: string; evidence_quote?: string }[];
    questions?: { stem?: string; options?: string[]; correct_index?: number; explanation?: string }[];
    source_notes?: { title?: string };
  };
  const seenTerms = new Set<string>();
  const keyTerms = (payload.concepts ?? []).flatMap((concept) => {
    const statement = concept.statement?.trim();
    if (!statement) return [];
    const topic = concept.topic?.trim() || '';
    const term = (topic && !seenTerms.has(topic.toLocaleLowerCase()) ? topic : statement).slice(0, 70);
    const key = term.toLocaleLowerCase();
    if (seenTerms.has(key)) return [];
    seenTerms.add(key);
    const definition = concept.evidence_quote?.trim() || statement;
    return [{ term, definition }];
  }).slice(0, 8);
  const questions = (payload.questions ?? []).flatMap((question) => {
    const options = question.options;
    const correct = question.correct_index;
    if (!question.stem || !options || options.length < 2 || correct == null || correct < 0 || correct >= options.length) return [];
    return [{ question: question.stem, options, correct_index: correct, explanation: question.explanation ?? '' }];
  });
  if (keyTerms.length < 2 || questions.length < 4) {
    throw new AgentError('There was not enough material to build both games. Add more notes or choose a broader topic.', 422);
  }
  return { title: payload.source_notes?.title?.trim() || 'Your study pack', key_terms: keyTerms, questions };
}

/** Re-read a session after a reconnect. Also applies the server-side timer. */
export async function resumeStudySession(sessionId: string): Promise<StudyState> {
  let response: Response;
  try {
    response = await fetch(`${agentUrl()}/study/session/${sessionId}`);
  } catch {
    throw new AgentError(`Could not reach the study backend at ${agentUrl()}.`);
  }

  const data = await readBody(response);
  if (!response.ok) {
    throw new AgentError(detailOf(data) ?? defaultFor(response.status), response.status);
  }
  return data as StudyState;
}

/**
 * Record one answer. `null` records an explicit skip, which the loop ignores
 * rather than counting as wrong — a skipped question is not a failed one.
 */
export function answerStudyQuestion(
  sessionId: string,
  questionId: string,
  selectedIndex: number | null,
): Promise<AdvanceResponse> {
  return postJson<AdvanceResponse>('/study/answer', {
    session_id: sessionId,
    question_id: questionId,
    selected_index: selectedIndex,
  });
}

/**
 * Answer the end-of-iteration question: do you want to see the answers?
 *
 * Declining re-asks the same questions unchanged; accepting
 * returns the answers and the next iteration reworded.
 */
export function revealStudyAnswers(
  sessionId: string,
  showAnswers: boolean,
): Promise<AdvanceResponse> {
  return postJson<AdvanceResponse>('/study/reveal', {
    session_id: sessionId,
    show_answers: showAnswers,
  });
}

export function finishStudySession(sessionId: string): Promise<FinishResponse> {
  return postJson<FinishResponse>('/study/finish', { session_id: sessionId });
}

/** One message for any failure, so screens never show a raw Error. */
export function describeAgentError(error: unknown): string {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
