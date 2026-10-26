

import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers.user import router as user_router
from routers.github import router as github_router
from routers.ingestion import router as ingestion_router

app = FastAPI(
    title="Unravel API",
    description="Backend service for Unravel project",
    version="1.0.0",
)

# Get frontend URL from environment variable, defaulting to localhost for development
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(user_router)
app.include_router(github_router)
app.include_router(ingestion_router)




#health check endpoint
@app.get("/")
def health():
    return {"status":"Unravel Backend System Online "}





if __name__ == "__main__":
    uvicorn.run("index:app", host="127.0.0.1", port=8000, reload=True)