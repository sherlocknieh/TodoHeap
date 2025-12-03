from dotenv import load_dotenv

load_dotenv()

import os

from breakdown_task import BreakdownTask
from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()


@app.get("/")
async def debug_page():
    return FileResponse(os.path.join("static", "debug.html"))


api_key = os.environ.get("DEEPSEEK_API_KEY")
if api_key is None:
    exit(1)
bdt = BreakdownTask(
    base_url="https://api.deepseek.com/v1", model="deepseek-chat", api_key=api_key
)


class RequestGoal(BaseModel):
    goal: str


@app.post("/decompose")
async def decompose(request: RequestGoal):
    response = bdt.prompt(request.goal)

    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="debug")
