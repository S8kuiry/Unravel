from pydantic import BaseModel

class FileContentsRequest(BaseModel):
    paths: list[str]