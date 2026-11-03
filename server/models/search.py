
from uuid import UUID

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    repo_id: UUID
    branch: str = Field(min_length=1)
    query: str = Field(min_length=1)
    limit: int = Field(default=10, ge=1, le=50)


class SearchResult(BaseModel):
    path: str
    name: str | None
    start_line: int
    end_line: int
    content: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
