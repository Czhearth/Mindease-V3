import os
import re
import random
import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
from time import time
from urllib.parse import quote_plus, unquote_plus

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from bson import ObjectId
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError
from starlette.middleware.base import BaseHTTPMiddleware

from crisis_detection import detect_crisis
from dataset_analysis import DatasetAnalyzer

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "mindease")
INTENTS_DATASET_PATH = os.getenv("INTENTS_DATASET_PATH", "dataset/intents.json")
AUTO_MOOD_INTERVAL_MINUTES = int(os.getenv("AUTO_MOOD_INTERVAL_MINUTES", "10"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500").split(",")
    if origin.strip()
]

app = FastAPI(title="MindEase API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeadersMiddleware)

dataset_analyzer = DatasetAnalyzer(INTENTS_DATASET_PATH)


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)


class MoodRequest(BaseModel):
    mood: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=250)


class JournalRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


def escape_mongo_uri_credentials(uri: str) -> str:
    # Escape credentials in mongodb URI and support passwords containing '@'.
    prefix_match = re.match(r"^(mongodb(?:\+srv)?://)(.+)$", uri)
    if not prefix_match:
        return uri

    prefix, remainder = prefix_match.groups()
    userinfo, at_sep, host_part = remainder.rpartition("@")
    if not at_sep:
        return uri

    username, colon_sep, password = userinfo.partition(":")
    if not colon_sep:
        return uri

    safe_username = quote_plus(unquote_plus(username))
    safe_password = quote_plus(unquote_plus(password))
    return f"{prefix}{safe_username}:{safe_password}@{host_part}"


MONGO_URI = escape_mongo_uri_credentials(MONGO_URI)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

mongo_client = MongoClient(MONGO_URI)
db = mongo_client[MONGO_DB_NAME]
users_collection = db["users"]
chat_collection = db["chat_messages"]
mood_collection = db["mood_logs"]
journal_collection = db["journal_entries"]

users_collection.create_index([("email", ASCENDING)], unique=True)
chat_collection.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
mood_collection.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
journal_collection.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])

user_limits: dict[str, list[float]] = {}
MAX_REQUESTS = 30
WINDOW_SECONDS = 3600

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are MindEase, a calm and emotionally intelligent mental health support assistant. "
        "Speak warmly, ask thoughtful follow-up questions, and provide practical grounding suggestions. "
        "Use short paragraphs, plain text only, and no markdown symbols like ** or bullet markers. "
        "If users sound vulnerable, do not pressure them into face-to-face conversations; listen first and validate feelings. "
        "Offer gentle, optional next steps such as breathing, journaling, text-based support, or staying present in chat. "
        "If discomfort persists, softly suggest consulting a doctor or mental health professional as an option, not a command."
    ),
}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def is_rate_limited(user_id: str) -> bool:
    now = time()
    window_entries = [stamp for stamp in user_limits.get(user_id, []) if now - stamp < WINDOW_SECONDS]
    if len(window_entries) >= MAX_REQUESTS:
        user_limits[user_id] = window_entries
        return True
    window_entries.append(now)
    user_limits[user_id] = window_entries
    return False


async def enforce_human_delay(started_at: float, min_seconds: float = 5.0, max_seconds: float = 10.0) -> None:
    target = random.uniform(min_seconds, max_seconds)
    elapsed = time() - started_at
    if elapsed < target:
        await asyncio.sleep(target - elapsed)


def polish_reply(text: str) -> str:
    if not text:
        return "I am here with you. Could you share a little more so I can support you better?"

    cleaned = text.strip()
    cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"`(.*?)`", r"\1", cleaned)
    cleaned = re.sub(r"^\s*[-*]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


def build_high_risk_reply(message: str) -> str:
    lowered = message.lower()
    avoids_calls = any(
        phrase in lowered
        for phrase in [
            "dont want to call",
            "don't want to call",
            "cant talk",
            "can't talk",
            "face to face",
            "introvert",
            "hate talking",
        ]
    )

    if avoids_calls:
        return (
            "I hear you, and I am really glad you told me this. You do not need to talk face to face right now. "
            "Let us keep this simple and stay here together for a moment. "
            "Try this: place one hand on your chest, breathe in for 4 seconds, hold for 4, and breathe out for 6. "
            "Repeat that 5 times. "
            "If you want, I can stay with you step by step and help you get through the next 10 minutes. "
            "If this discomfort keeps feeling heavy, we can also consider a doctor or therapist later in a way that feels safe for you."
        )

    return (
        "I am really sorry you are feeling this way, and I am here with you right now. "
        "You deserve support and you are not a burden. "
        "Let us focus on this moment gently: breathe in slowly for 4, hold for 4, and exhale for 6, five times. "
        "Then name 5 things you can see around you. "
        "If this discomfort continues, it may help to speak with a doctor or therapist when you feel ready."
    )


def infer_mood_and_summary(message: str, analysis: dict) -> tuple[str, str]:
    lowered = message.lower()
    intent = str(analysis.get("intent", "")).lower()

    if any(token in lowered for token in ["panic", "can't breathe", "cant breathe", "anxious", "anxiety", "nervous"]):
        return "anxious", "Seems anxious and overwhelmed"
    if any(token in lowered for token in ["tired", "exhausted", "drained", "sleepy"]):
        return "tired", "Seems mentally and physically drained"
    if any(token in lowered for token in ["stressed", "pressure", "deadline", "too much"]):
        return "stressed", "Seems under pressure and stress"
    if any(token in lowered for token in ["sad", "empty", "hopeless", "cry", "alone"]):
        return "sad", "Seems low and emotionally heavy"
    if any(token in lowered for token in ["grateful", "thankful", "appreciate"]):
        return "grateful", "Showing gratitude and reflection"
    if any(token in lowered for token in ["happy", "great", "good", "better", "calm", "peaceful"]):
        return "happy", "Feeling more stable and positive"

    intent_map = {
        "sad": ("sad", "Seems low and emotionally heavy"),
        "depressed": ("sad", "Seems low and emotionally heavy"),
        "anxious": ("anxious", "Seems anxious and overwhelmed"),
        "stress": ("stressed", "Seems under pressure and stress"),
        "stressed": ("stressed", "Seems under pressure and stress"),
        "grateful": ("grateful", "Showing gratitude and reflection"),
        "happy": ("happy", "Feeling more stable and positive"),
        "neutral": ("neutral", "Emotion appears balanced right now"),
    }
    if intent in intent_map:
        return intent_map[intent]

    return "neutral", "Emotion appears balanced right now"


def maybe_store_auto_mood(user_id: str, mood_value: str, summary: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=AUTO_MOOD_INTERVAL_MINUTES)
    existing = mood_collection.find_one(
        {
            "user_id": user_id,
            "source": "auto_inferred",
            "created_at": {"$gte": cutoff},
        }
    )
    if existing:
        return False

    mood_collection.insert_one(
        {
            "user_id": user_id,
            "mood": mood_value,
            "note": f"Auto-checkin: {summary}",
            "source": "auto_inferred",
            "created_at": datetime.now(timezone.utc),
        }
    )
    return True


def call_openrouter(messages: list[dict], model: str = "openai/gpt-4o-mini") -> str:
    if not OPENROUTER_API_KEY:
        return "I am currently running in safe offline mode. Please configure OPENROUTER_API_KEY."

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.6,
                "max_tokens": 280,
            },
            timeout=35,
        )
        data = response.json()
        if "choices" not in data:
            return "I am having trouble responding right now. Please try again in a moment."
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return "I am having trouble responding right now. Please try again in a moment."


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id or not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"user_id": user_id, "email": email}
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "mindease-api"}


@app.get("/api/dataset/status")
async def dataset_status(user=Depends(get_current_user)):
    return dataset_analyzer.status()


@app.post("/api/auth/register")
async def register_user(payload: RegisterRequest):
    email = normalize_email(payload.email)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email")

    document = {
        "full_name": payload.full_name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = users_collection.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists") from exc

    token = create_access_token(str(result.inserted_id), email)
    return {
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "full_name": document["full_name"],
            "email": email,
        },
    }


@app.post("/api/auth/login")
async def login_user(payload: LoginRequest):
    email = normalize_email(payload.email)
    user = users_collection.find_one({"email": email})

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(str(user["_id"]), email)
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "full_name": user["full_name"],
            "email": user["email"],
        },
    }


@app.get("/api/intro")
async def ai_intro(user=Depends(get_current_user)):
    intro_prompt = [
        {
            "role": "system",
            "content": "You are a warm guide for a mental health app. Keep your response under 70 words.",
        },
        {
            "role": "user",
            "content": "Write a short welcome line for the user to begin their wellbeing journey.",
        },
    ]
    intro_text = call_openrouter(intro_prompt)
    return {"intro": intro_text, "email": user["email"]}


@app.post("/api/chat")
async def chat(payload: ChatRequest, user=Depends(get_current_user)):
    started_at = time()
    user_id = user["user_id"]

    if is_rate_limited(user_id):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    crisis_level = detect_crisis(payload.message)
    if crisis_level == "HIGH":
        crisis_reply = build_high_risk_reply(payload.message)
        timestamp = datetime.now(timezone.utc)
        chat_collection.insert_many(
            [
                {
                    "user_id": user_id,
                    "role": "user",
                    "content": payload.message,
                    "created_at": timestamp,
                },
                {
                    "user_id": user_id,
                    "role": "assistant",
                    "content": crisis_reply,
                    "created_at": timestamp,
                },
            ]
        )
        # Crisis replies should stay immediate; avoid artificial delay.
        return {"reply": crisis_reply, "risk": "HIGH"}

    analysis = dataset_analyzer.analyze(payload.message)
    inferred_mood, feeling_summary = infer_mood_and_summary(payload.message, analysis)

    history_docs = list(
        chat_collection.find({"user_id": user_id}).sort("created_at", DESCENDING).limit(12)
    )
    history_docs.reverse()

    messages = [SYSTEM_PROMPT]
    for item in history_docs:
        messages.append({"role": item["role"], "content": item["content"]})
    if analysis.get("enabled") and analysis.get("confidence", 0) >= 0.2:
        messages.append(
            {
                "role": "system",
                "content": (
                    "Situation analysis context from verified mental-health intent dataset: "
                    f"intent='{analysis['intent']}', confidence={analysis['confidence']}, "
                    f"matched_pattern='{analysis['matched_pattern']}'. "
                    "Use this as guidance for empathy, but keep your response natural and supportive."
                ),
            }
        )
    messages.append({"role": "user", "content": payload.message})

    reply = polish_reply(call_openrouter(messages))

    # Keep response in the requested 5-10 second window when possible.
    await enforce_human_delay(started_at)

    auto_logged = maybe_store_auto_mood(user_id, inferred_mood, feeling_summary)

    timestamp = datetime.now(timezone.utc)
    chat_collection.insert_many(
        [
            {
                "user_id": user_id,
                "role": "user",
                "content": payload.message,
                "created_at": timestamp,
            },
            {
                "user_id": user_id,
                "role": "assistant",
                "content": reply,
                "created_at": timestamp,
            },
        ]
    )

    return {
        "reply": reply,
        "risk": crisis_level,
        "analysis": {
            "intent": analysis.get("intent", "unknown"),
            "confidence": analysis.get("confidence", 0.0),
            "inferred_mood": inferred_mood,
            "feeling_summary": feeling_summary,
            "auto_mood_logged": auto_logged,
        },
        "latency_seconds": round(time() - started_at, 2),
    }


@app.get("/api/chat/history")
async def chat_history(limit: int = 30, user=Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    docs = list(
        chat_collection.find({"user_id": user["user_id"]}).sort("created_at", DESCENDING).limit(limit)
    )
    docs.reverse()
    return {
        "messages": [
            {
                "role": item["role"],
                "content": item["content"],
                "created_at": item["created_at"],
            }
            for item in docs
        ]
    }


@app.post("/api/journal")
async def save_journal_entry(payload: JournalRequest, user=Depends(get_current_user)):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Journal entry cannot be empty")

    created_at = datetime.now(timezone.utc)
    result = journal_collection.insert_one(
        {
            "user_id": user["user_id"],
            "content": content,
            "created_at": created_at,
        }
    )

    return {
        "status": "saved",
        "entry": {
            "id": str(result.inserted_id),
            "content": content,
            "created_at": created_at,
        },
    }


@app.get("/api/journal/history")
async def journal_history(limit: int = 20, offset: int = 0, user=Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    docs = list(
        journal_collection.find({"user_id": user["user_id"]})
        .sort("created_at", DESCENDING)
        .skip(offset)
        .limit(limit)
    )
    docs.reverse()
    total_entries = journal_collection.count_documents({"user_id": user["user_id"]})
    next_offset = offset + len(docs)

    return {
        "entries": [
            {
                "id": str(item["_id"]),
                "content": item["content"],
                "created_at": item["created_at"],
            }
            for item in docs
        ],
        "total": total_entries,
        "next_offset": next_offset,
        "has_more": next_offset < total_entries,
    }


@app.put("/api/journal/{entry_id}")
async def update_journal_entry(entry_id: str, payload: JournalRequest, user=Depends(get_current_user)):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Journal entry cannot be empty")

    try:
        object_id = ObjectId(entry_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid journal entry id") from exc

    result = journal_collection.update_one(
        {"_id": object_id, "user_id": user["user_id"]},
        {
            "$set": {
                "content": content,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")

    return {"status": "updated", "id": entry_id, "content": content}


@app.delete("/api/journal/{entry_id}")
async def delete_journal_entry(entry_id: str, user=Depends(get_current_user)):
    try:
        object_id = ObjectId(entry_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid journal entry id") from exc

    result = journal_collection.delete_one({"_id": object_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")

    return {"status": "deleted", "id": entry_id}


@app.post("/api/mood")
async def log_mood(payload: MoodRequest, user=Depends(get_current_user)):
    allowed = {"happy", "neutral", "sad", "anxious", "stressed", "tired", "grateful"}
    mood_value = payload.mood.strip().lower()
    if mood_value not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported mood value")

    mood_collection.insert_one(
        {
            "user_id": user["user_id"],
            "mood": mood_value,
            "note": payload.note.strip(),
            "source": "manual",
            "created_at": datetime.now(timezone.utc),
        }
    )

    return {"status": "saved", "mood": mood_value}


@app.get("/api/dashboard/mood")
async def mood_dashboard(days: int = 14, user=Depends(get_current_user)):
    days = max(3, min(days, 60))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    docs = list(
        mood_collection.find(
            {
                "user_id": user["user_id"],
                "created_at": {"$gte": cutoff},
            }
        ).sort("created_at", ASCENDING)
    )

    mood_counter = Counter(item["mood"] for item in docs)
    timeline = [
        {
            "date": item["created_at"].strftime("%Y-%m-%d"),
            "mood": item["mood"],
            "note": item.get("note", ""),
        }
        for item in docs
    ]

    reminders = [
        "Take a 2-minute breathing break every 3 hours.",
        "Log your mood after lunch and before sleep.",
        "Reach out to one trusted person this week.",
    ]

    return {
        "summary": mood_counter,
        "timeline": timeline,
        "reminders": reminders,
        "total_entries": len(docs),
    }


@app.get("/api/about")
async def about_features():
    return {
        "title": "MindEase Aura 3.0",
        "tagline": "Begin your journey with privacy-first emotional support.",
        "highlights": [
            "Blockchain Security",
            "Smart Analysis",
            "IoT Integration",
            "Progress Tracking",
            "Privacy First",
            "Holistic Care",
        ],
        "dataset_note": "Behavior insights inspired by public mood and wellbeing datasets from Kaggle.",
    }