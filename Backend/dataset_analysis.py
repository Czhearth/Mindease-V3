import json
import random
import re
from pathlib import Path
from typing import Any


class DatasetAnalyzer:
    def __init__(self, dataset_path: str):
        self.dataset_path = Path(dataset_path)
        self._mtime: float | None = None
        self._intents: list[dict[str, Any]] = []

    def _tokenize(self, text: str) -> set[str]:
        return set(re.findall(r"[a-zA-Z']+", text.lower()))

    def _score_pattern(self, msg_tokens: set[str], pattern: str) -> float:
        pattern_tokens = self._tokenize(pattern)
        if not pattern_tokens:
            return 0.0

        overlap = len(msg_tokens.intersection(pattern_tokens))
        union = len(msg_tokens.union(pattern_tokens))
        jaccard = overlap / union if union else 0.0

        # Slightly reward high overlap for short patterns.
        coverage = overlap / max(len(pattern_tokens), 1)
        return (0.7 * jaccard) + (0.3 * coverage)

    def _normalize_records(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        intents = payload.get("intents", [])
        if not isinstance(intents, list):
            return []

        clean: list[dict[str, Any]] = []
        for item in intents:
            if not isinstance(item, dict):
                continue
            tag = str(item.get("tag", "")).strip().lower()
            patterns = item.get("patterns", [])
            responses = item.get("responses", [])
            if not tag or not isinstance(patterns, list) or not isinstance(responses, list):
                continue
            pattern_values = [str(p).strip() for p in patterns if str(p).strip()]
            response_values = [str(r).strip() for r in responses if str(r).strip()]
            if not pattern_values:
                continue
            clean.append(
                {
                    "tag": tag,
                    "patterns": pattern_values,
                    "responses": response_values,
                }
            )
        return clean

    def load_if_needed(self) -> None:
        if not self.dataset_path.exists():
            self._intents = []
            self._mtime = None
            return

        mtime = self.dataset_path.stat().st_mtime
        if self._mtime is not None and mtime == self._mtime:
            return

        with self.dataset_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        self._intents = self._normalize_records(payload)
        self._mtime = mtime

    def analyze(self, message: str) -> dict[str, Any]:
        self.load_if_needed()
        if not self._intents:
            return {
                "enabled": False,
                "intent": "unknown",
                "confidence": 0.0,
                "matched_pattern": "",
                "suggested_response": "",
            }

        msg_tokens = self._tokenize(message)
        if not msg_tokens:
            return {
                "enabled": True,
                "intent": "unknown",
                "confidence": 0.0,
                "matched_pattern": "",
                "suggested_response": "",
            }

        best_intent = "unknown"
        best_pattern = ""
        best_score = 0.0
        candidate_responses: list[str] = []

        for item in self._intents:
            tag = item["tag"]
            patterns = item["patterns"]
            responses = item["responses"]
            for pattern in patterns:
                score = self._score_pattern(msg_tokens, pattern)
                if score > best_score:
                    best_score = score
                    best_intent = tag
                    best_pattern = pattern
                    candidate_responses = responses

        suggestion = random.choice(candidate_responses) if candidate_responses else ""

        return {
            "enabled": True,
            "intent": best_intent,
            "confidence": round(float(best_score), 3),
            "matched_pattern": best_pattern,
            "suggested_response": suggestion,
        }

    def status(self) -> dict[str, Any]:
        self.load_if_needed()
        return {
            "path": str(self.dataset_path),
            "exists": self.dataset_path.exists(),
            "intents_count": len(self._intents),
            "loaded": len(self._intents) > 0,
        }
