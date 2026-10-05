

from fastapi import FastAPI,Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers.user import router as user_router
from routers.github import router as github_router

app = FastAPI(
    title="Unravel API",
    description="Backend service for Unravel project",
    version="1.0.0",
)

# Enable CORS for Next.js frontend running on port 3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(user_router)
app.include_router(github_router)




#health check endpoint
@app.get("/")
def health():
    return {"status":"Unravel Backend System Online "}





if __name__ == "__main__":
    uvicorn.run("index:app", host="127.0.0.1", port=8000, reload=True)