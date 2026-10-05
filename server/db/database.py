import os
from typing import AsyncGenerator
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is missing")

# Neon requires 'postgresql+asyncpg://' for async SQLAlchemy operations
# If your string starts with 'postgresql://', replace it automatically
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create Async Engine optimized for Neon serverless pooler
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True if you want to see SQL queries in console during dev
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory for handling requests
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


# Dependency injection for FastAPI endpoints
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()