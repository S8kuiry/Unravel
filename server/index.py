

import logging
import os
from dotenv import load_dotenv
load_dotenv()
# Emit app-level INFO logs (e.g. search/embedding timings) to docker logs.
# Python root logger defaults to WARNING, which hides logger.info() calls.
logging.basicConfig(level=logging.INFO)
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers.user import router as user_router
from routers.github import router as github_router
from routers.ingestion import router as ingestion_router
from routers.search import router as search_router
from routers.conversation import router as conversation_router
from routers.websocket import router as  websocket_router

#inngest imports
import inngest.fast_api
from inngest_worker.inngest_client import inngest_client
from inngest_worker.indexing import index_repository_files

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
app.include_router(search_router)
app.include_router(conversation_router)
app.include_router(websocket_router, prefix="/ws")





#Register Inngest with FastAPI
inngest.fast_api.serve(
    app,
    inngest_client,
    [index_repository_files],
)

#health check endpoint
@app.get("/")
def health():
    return {"status":"Unravel Backend System Online "}





if __name__ == "__main__":
    uvicorn.run("index:app", host="127.0.0.1", port=8000, reload=True)