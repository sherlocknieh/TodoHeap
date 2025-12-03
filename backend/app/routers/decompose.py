from fastapi import APIRouter
from app.services.ai_decompose import decompose_goal
import json

router = APIRouter()

@router.post("/decompose")
async def decompose(payload: dict):
    user_goal = payload["goal"]

    raw = await decompose_goal(user_goal)
    result = json.loads(raw)  # AI 输出 JSON

    return result
