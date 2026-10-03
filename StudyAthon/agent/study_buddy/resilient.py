"""A Gemini wrapper that survives capacity errors and unavailable models.

Motivation: `gemini-3.8-flash` returns ``503 UNAVAILABLE ... high demand``
intermittently in practice, and not every model advertised by ``models.list()``
is actually servable with a given key (``gemini-2.5-flash`` and
``gemini-3.1-flash`` both listed but 404 on generate during testing). A single
transient 503 therefore kills an entire four-stage ingestion run, which is a bad
trade for a one-shot pipeline.

This wrapper retries a candidate model with exponential backoff, then falls
through to the next candidate. An unrecoverable key problem (401/403) still fails
fast, because retrying that just wastes the user's time.
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncGenerator

from google.adk.models.base_llm import BaseLlm
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import errors
from pydantic import Field

logger = logging.getLogger(__name__)

# Retry the same model with backoff. Capacity and quota problems are transient.
_RETRY_CODES = frozenset({408, 429, 500, 502, 503, 504})
# The key itself is wrong; another model will not help.
_FATAL_CODES = frozenset({401, 403})

# A 429 asking us to wait longer than this is a quota ceiling, not a burst
# limit. The Gemini free tier reports `generate_content_free_tier_requests` as a
# per-day, per-model cap with a retry delay measured in hours, which no amount of
# exponential backoff inside one request will satisfy. Skip to a fallback instead.
_QUOTA_WAIT_THRESHOLD = 120.0


def _parse_seconds(raw: object) -> float | None:
    """Parse a protobuf duration string such as ``"16531s"`` or ``"1.5s"``."""
    if not isinstance(raw, str):
        return None
    try:
        return float(raw.rstrip("s"))
    except ValueError:
        return None


def retry_after_seconds(exc: Exception) -> float | None:
    """Extract the server-advised wait from a RESOURCE_EXHAUSTED error."""
    payload = getattr(exc, "details", None)
    if not isinstance(payload, dict):
        return None
    for detail in payload.get("error", {}).get("details", []) or []:
        if not isinstance(detail, dict):
            continue
        if detail.get("@type", "").endswith("google.rpc.RetryInfo"):
            return _parse_seconds(detail.get("retryDelay"))
    return None


def classify(exc: Exception) -> str:
    """Return 'retry' (same model), 'fatal' (stop), or 'next' (different model)."""
    if isinstance(exc, errors.ClientError | errors.ServerError):
        code = getattr(exc, "code", None)
        if code in _FATAL_CODES:
            return "fatal"
        if code in _RETRY_CODES:
            advised = retry_after_seconds(exc)
            # A multi-hour wait means we are out of daily quota on this model.
            if advised is not None and advised > _QUOTA_WAIT_THRESHOLD:
                return "next"
            return "retry"
        # 404/400 and friends: this specific model cannot serve this request,
        # so a different model might. Do not burn retries on it.
        return "next"
    # Timeouts and anything unrecognised are usually worth one more try.
    return "retry"


class InvalidRequestError(RuntimeError):
    """Every candidate model rejected the request with 400 INVALID_ARGUMENT.

    A model-independent 400 means the payload itself is bad - in practice a
    corrupt or mislabelled upload - so it is worth distinguishing from a genuine
    outage and reporting it as a client error rather than a gateway failure.
    """


class ResilientGemini(BaseLlm):
    """Try each candidate model in turn, retrying transient failures."""

    # `model` is a required field on BaseLlm; the real selection happens per
    # attempt via `candidates`. The first candidate is the nominal model.
    model: str = "resilient-gemini"
    candidates: list[str] = Field(default_factory=list)
    attempts_per_model: int = 3
    base_delay: float = 2.0
    max_delay: float = 20.0

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        candidates = self.candidates or [self.model]
        failures: list[str] = []
        argument_failures: list[str] = []
        other_failures: list[str] = []
        longest_wait = 0.0

        for candidate in candidates:
            backend = Gemini(model=candidate)

            for attempt in range(1, self.attempts_per_model + 1):
                # Gemini mutates the request in place (rewrites inline parts and
                # appends assistant content), so each attempt needs its own copy
                # or a retry would resend duplicated content.
                request = llm_request.model_copy(deep=True)
                request.model = candidate

                try:
                    async for response in backend.generate_content_async(
                        request, stream
                    ):
                        yield response
                    return
                except Exception as exc:  # noqa: BLE001 - classified below
                    action = classify(exc)
                    label = f"{candidate} (attempt {attempt}/{self.attempts_per_model})"
                    advised = retry_after_seconds(exc)
                    if advised:
                        longest_wait = max(longest_wait, advised)
                    if action == "fatal":
                        raise
                    if action == "next":
                        self._record(failures, argument_failures, other_failures, exc, label)
                        logger.warning("Skipping model %s: %s", label, exc)
                        break
                    if attempt == self.attempts_per_model:
                        self._record(failures, argument_failures, other_failures, exc, label)
                        break
                    delay = min(self.base_delay * 2 ** (attempt - 1), self.max_delay)
                    logger.warning(
                        "Transient error on %s, retrying in %.1fs: %s", label, delay, exc
                    )
                    await asyncio.sleep(delay)

        detail = "; ".join(failures) or "no models configured"
        message = (
            "All candidate models failed. "
            "Add a fallback or retry later. "
            f"Tried: {detail}"
        )
        # A daily quota ceiling is the most likely cause and the least obvious,
        # so say so plainly rather than leaving "try again later" hanging.
        if longest_wait and longest_wait > _QUOTA_WAIT_THRESHOLD:
            hours = longest_wait / 3600
            message += (
                f" A model reported its free-tier quota exhausted, resetting in "
                f"about {hours:.1f}h. Billing is required for more requests."
            )

        # A 400 from any model that actually reached us proves the payload is
        # invalid, because that check is model-independent. A model blocked by
        # quota is *not* evidence the payload is fine, so it must not veto this:
        # otherwise a corrupt upload hides behind a quota error until tomorrow.
        # Only a non-argument, non-quota failure (a genuine outage) overrides it.
        if argument_failures and not other_failures:
            suffix = (
                " Some models were quota-blocked, but every model that was reached "
                "rejected the payload."
                if longest_wait > _QUOTA_WAIT_THRESHOLD
                else ""
            )
            raise InvalidRequestError(
                "At least one model rejected the request as invalid (400), and no "
                "other kind of failure occurred. An uploaded file is most likely "
                f"corrupt or not really the format it claims to be.{suffix} "
                f"Tried: {detail}"
            )
        raise RuntimeError(message)

    @staticmethod
    def _record(
        failures: list[str],
        argument_failures: list[str],
        other_failures: list[str],
        exc: Exception,
        label: str,
    ) -> None:
        """Bucket one exhausted attempt for the final diagnosis."""
        failures.append(f"{label}: {type(exc).__name__} {exc}")
        code = getattr(exc, "code", None)
        quota_wait = retry_after_seconds(exc) or 0.0
        if code == 400:
            argument_failures.append(label)
        elif not (code == 429 and quota_wait > _QUOTA_WAIT_THRESHOLD):
            other_failures.append(label)

