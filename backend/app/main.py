from fastapi import FastAPI
from app.routers import decompose, tasks

app = FastAPI()

app.include_router(decompose.router)
app.include_router(tasks.router)
