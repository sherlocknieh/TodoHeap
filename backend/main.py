from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.responses import FileResponse
import os

app = FastAPI()

@app.get("/")
async def debug_page():
    return FileResponse(os.path.join("static", "debug.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)