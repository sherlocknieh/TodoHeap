from fastapi import APIRouter
from supabase import create_client
import os

router = APIRouter()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

@router.post("/tasks/save")
async def save_goal_and_tasks(payload: dict):
    goal = payload["goal"]
    tasks = payload["tasks"]

    # 插入 goal
    res = supabase.table("goals").insert({"user_text": goal}).execute()
    goal_id = res.data[0]["id"]

    # 插入 tasks
    for t in tasks:
        supabase.table("tasks").insert({
            "goal_id": goal_id,
            "title": t["title"],
            "description": t.get("description"),
            "depends_on": t["depends_on"]
        }).execute()

    return {"ok": True, "goal_id": goal_id}
