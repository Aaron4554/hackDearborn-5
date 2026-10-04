import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  answerStudyQuestion,
  createStudySession,
  describeAgentError,
  finishStudySession,
  resumeStudySession,
  revealStudyAnswers,
  type AdvanceResponse,
  type AnswerKey,
  type IterationSummary,
  type PublicQuestion,
  type SessionStatus,
  type StudySessionRequest,
} from '@/services/agent';

/**
 * Where the student is in the loop.
 *
 * `reveal` is its own phase because the backend pauses there: after an iteration
 * with any wrong answer it refuses further answers until the student answers
 * "do you want to see the answers?". Skipping that prompt would strand the
 * session.
 */
export type StudyPhase = 'idle' | 'quiz' | 'reveal' | 'results' | 'finished';

type StudyContextValue = {
  phase: StudyPhase;
  sessionId: string | null;
  iteration: number;
  questions: PublicQuestion[];
  cursor: number;
  currentQuestion: PublicQuestion | null;
  summary: IterationSummary | null;
  answers: AnswerKey[] | null;
  finishedReason: string | null;
  /** Seconds left on the server's deadline, or null when no timer was set. */
  secondsRemaining: number | null;
  busy: boolean;
  error: string | null;
  start: (request: StudySessionRequest) => Promise<boolean>;
  cancelStart: () => void;
  answer: (selectedIndex: number | null) => Promise<void>;
  reveal: (showAnswers: boolean) => Promise<void>;
  /**
   * Move from a finished round's recap into the questions already waiting from
   * the backend. Returns false when there is nothing left to start, so the
   * caller never navigates into a quiz with no round behind it.
   */
  nextRound: () => boolean;
  end: () => Promise<void>;
  resume: () => Promise<void>;
  reset: () => void;
};

const StudyContext = createContext<StudyContextValue | undefined>(undefined);

/** Mirrors the server's `finished_reason` values into something readable. */
function explainFinish(reason: string | null): string | null {
  switch (reason) {
    case 'timer_expired':
      return 'Time is up. Here is how far you got.';
    case 'no_questions_left':
      return 'Nothing left to ask, so we stopped here.';
    case 'student_ended':
      return 'You ended this session.';
    default:
      return null;
  }
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<StudyPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [iteration, setIteration] = useState(1);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [cursor, setCursor] = useState(0);
  const [summary, setSummary] = useState<IterationSummary | null>(null);
  const [answers, setAnswers] = useState<AnswerKey[] | null>(null);
  const [finishedReason, setFinishedReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The deadline is the server's, converted to a local clock so the countdown is
  // display-only. Every request re-checks the real deadline, so a student who
  // edits their device clock gains nothing.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const secondsRemaining = useMemo(() => {
    if (deadline == null) return null;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }, [deadline, now]);

  // Guards against a double-tap submitting the same question twice, which the
  // backend rejects as a conflict.
  const inFlight = useRef(false);
  const startController = useRef<AbortController | null>(null);
  const startGeneration = useRef(0);

  const applyAdvance = useCallback((response: AdvanceResponse) => {
    setIteration(response.iteration);
    setSummary(response.summary ?? null);
    setAnswers(response.answers ?? null);

    if (response.status === 'awaiting_reveal') {
      setPhase('reveal');
      return;
    }

    if (response.status === 'finished') {
      setFinishedReason(explainFinish(response.finished_reason ?? null));
      setPhase('finished');
      return;
    }

    const next = response.questions ?? [];
    if (next.length > 0) {
      setQuestions(next);
      setCursor(0);
      setPhase('results');
    } else {
      setPhase('results');
    }
  }, []);

  const reset = useCallback(() => {
    startGeneration.current += 1;
    startController.current?.abort();
    startController.current = null;
    setPhase('idle');
    setSessionId(null);
    setIteration(1);
    setQuestions([]);
    setCursor(0);
    setSummary(null);
    setAnswers(null);
    setFinishedReason(null);
    setError(null);
    setBusy(false);
    setDeadline(null);
    inFlight.current = false;
  }, []);

  /**
 * Runs one backend call, owning the busy flag, the error slot, and the
 * double-submit guard.
 *
 * Resolves to `null` when the call was suppressed or failed, so callers must
 * check the result before trusting it. The `<T,>` is required in a .tsx file to
 * keep this from parsing as a JSX element.
 */
const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
  if (inFlight.current) return null;
  inFlight.current = true;
  setBusy(true);
  setError(null);
  try {
    return await action();
  } catch (caught) {
    setError(describeAgentError(caught));
    return null;
  } finally {
    setBusy(false);
    inFlight.current = false;
  }
}, []);

const start = useCallback(async (request: StudySessionRequest) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    const generation = ++startGeneration.current;
    const controller = new AbortController();
    startController.current = controller;
    setBusy(true);
    setError(null);
    try {
      const created = await createStudySession(request, controller.signal);
      if (generation !== startGeneration.current) return false;
      setSessionId(created.session_id);
      setIteration(created.iteration);
      setQuestions(created.questions ?? []);
      setCursor(0);
      setSummary(null);
      setAnswers(null);
      setFinishedReason(null);
      setPhase('quiz');
      setDeadline(
        created.seconds_remaining != null
          ? Date.now() + created.seconds_remaining * 1000
          : null,
      );
      return true;
    } catch (caught) {
      if (generation === startGeneration.current && !(caught instanceof Error && caught.name === 'AbortError')) {
        setError(describeAgentError(caught));
      }
      return false;
    } finally {
      if (generation === startGeneration.current) {
        startController.current = null;
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, []);

  const cancelStart = useCallback(() => {
    if (!startController.current) return;
    startGeneration.current += 1;
    startController.current.abort();
    startController.current = null;
    inFlight.current = false;
    setBusy(false);
    setError(null);
  }, []);

  const answer = useCallback(
    async (selectedIndex: number | null) => {
      const question = questions[cursor];
      if (!sessionId || !question) return;

      const previousCursor = cursor;
      // Move the cursor immediately so the card feels instant. The response is
      // authoritative, and if the request fails the question comes back: a
      // half-advanced cursor would silently skip a question the backend never
      // recorded, which is exactly the kind of thing a student cannot see.
      setCursor(previousCursor + 1);

      const response = await run(() =>
        answerStudyQuestion(sessionId, question.id, selectedIndex),
      );
      if (!response) {
        setCursor(previousCursor);
        return;
      }
      if (response.iteration_complete) applyAdvance(response);
    },
    [applyAdvance, cursor, questions, run, sessionId],
  );

  const reveal = useCallback(
    async (showAnswers: boolean) => {
      if (!sessionId) return;
      await run(async () => {
        applyAdvance(await revealStudyAnswers(sessionId, showAnswers));
      });
    },
    [applyAdvance, run, sessionId],
  );

  const nextRound = useCallback(() => {
    // The backend has already handed over the next round's questions by the
    // time the recap shows; only the phase still says "recap". Flipping it here
    // is what makes "Start round N" do anything — the quiz screen bounces back
    // to the recap for as long as the phase reads `results`.
    if (phase !== 'results' || questions.length === 0) return false;
    setCursor(0);
    setSummary(null);
    setAnswers(null);
    setError(null);
    setPhase('quiz');
    return true;
  }, [phase, questions.length]);

  const end = useCallback(async () => {
    if (!sessionId) {
      reset();
      return;
    }
    await run(async () => {
      const response = await finishStudySession(sessionId);
      setFinishedReason(explainFinish(response.finished_reason));
      // The finish payload carries the recap for the round being quit, which is
      // fresher than whatever the screen was last showing. Revealed answers are
      // left alone: `nextRound` already drops them when a round rolls over, so
      // anything still here belongs to the recap the student is looking at.
      setSummary(response.summary ?? null);
      setPhase('finished');
    });
  }, [reset, run, sessionId]);

  const resume = useCallback(async () => {
    if (!sessionId) return;
    await run(async () => {
      const state = await resumeStudySession(sessionId);
      setIteration(state.iteration);
      setQuestions(state.questions ?? []);
      setCursor(0);
      if (state.status === 'finished') {
        setFinishedReason(explainFinish(state.finished_reason));
        // The timer can close a session between two answers, so the iteration
        // never reports itself. The backend sends the recap and the wrong
        // answers with the finished state for exactly this case.
        setSummary(state.summary ?? null);
        setAnswers(state.answers ?? null);
        setPhase('finished');
        // A finished session has no countdown left. Re-arming it from a zero
        // `seconds_remaining` would schedule another expiry check, which would
        // ask the server the same question forever.
        setDeadline(null);
        return;
      }

      setDeadline(
        state.seconds_remaining != null
          ? Date.now() + state.seconds_remaining * 1000
          : null,
      );
    });
  }, [run, sessionId]);

// A countdown reaching zero is only a local hint; the server holds the real
// deadline and re-checks it on every request. Nudging the student to the summary
// keeps them from tapping a question that is already closed, so the ticker asks
// the server what happened instead of guessing. One shot per deadline.
const expiryHandled = useRef(false);

useEffect(() => {
  expiryHandled.current = false;
}, [deadline]);

useEffect(() => {
  if (deadline == null) return undefined;

  const tick = () => {
    const current = Date.now();
    setNow(current);
    if (current >= deadline && !expiryHandled.current && phase === 'quiz') {
      expiryHandled.current = true;
      void resume();
    }
  };

  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}, [deadline, phase, resume]);

const value = useMemo<StudyContextValue>(
    () => ({
      phase,
      sessionId,
      iteration,
      questions,
      cursor,
      currentQuestion: questions[cursor] ?? null,
      summary,
      answers,
      finishedReason,
      secondsRemaining,
      busy,
      error,
      start,
      cancelStart,
      answer,
      reveal,
      nextRound,
      end,
      resume,
      reset,
    }),
    [
      answer,
      answers,
      busy,
      cancelStart,
      cursor,
      end,
      error,
      finishedReason,
      iteration,
      nextRound,
      phase,
      questions,
      reset,
      resume,
      reveal,
      secondsRemaining,
      sessionId,
      start,
      summary,
    ],
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyContextValue {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error('useStudy must be used inside StudyProvider.');
  }
  return context;
}

export type { SessionStatus };
