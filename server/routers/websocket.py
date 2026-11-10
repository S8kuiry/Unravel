from uuid import UUID
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from security.auth import verify_firebase_token  # Adjust import to your actual auth module
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from db.database import get_db
from models.conversation import Conversation
from models.github import Repository
from crud.conversation import create_message
from services.agent.agent import run_agent

router = APIRouter()

@router.websocket("/conversations/{conversation_id}")
async def conversation_websocket(
    websocket: WebSocket,
    conversation_id: UUID,
    token: str,
    db: AsyncSession = Depends(get_db),

):
    # 1. Verify Firebase token
    try:
        uid = verify_firebase_token(token)
    except Exception:
        await websocket.close(code=1008)
        return

    statement = (
     select(Conversation)
        .join(
        Repository,
        Conversation.repo_id == Repository.id,
        )
        .where(
        Conversation.id == conversation_id,
        Repository.user_uid == uid,
    )
)

    result = await db.execute(statement)
    conversation = result.scalar_one_or_none()

    if conversation is None:
        await websocket.close(code=1008)
        return

    # 2. Accept connection
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()

            message = data.get("message")
            branch = data.get("branch")
            context = data.get("context")

            if not isinstance(message, str) or not message.strip():
                await websocket.send_json({
                    "type": "error",
                    "message": "Message cannot be empty",
                })
                continue

            if not isinstance(branch, str) or not branch.strip():
                await websocket.send_json({
                    "type": "error",
                    "message": "Branch is required",
                })
                continue

            if context is not None and not isinstance(context, list):
                await websocket.send_json({
                    "type": "error",
                    "message": "Context must be a list",
                })
                continue

            try:
                # 1. Save user's message
                user_message = await create_message(
                    db=db,
                    conversation=conversation,
                    content=message,
                    role="user",
                )

                # 2. Return the saved user message immediately
                await websocket.send_json({
                    "type": "user_message_saved",
                    "message": {
                        "id": str(user_message.id),
                        "role": user_message.role,
                        "content": user_message.content,
                        "created_at": user_message.created_at.isoformat(),
                    },
                })

                # 3. Generate agent response
                answer = await run_agent(
                    message=message,
                    db=db,
                    repo_id=conversation.repo_id,
                    branch=branch,
                    context=context,
                )

                # 4. Save agent response
                agent_message = await create_message(
                    db=db,
                    conversation=conversation,
                    content=answer,
                    role="agent",
                )

                # 5. Return saved agent message
                await websocket.send_json({
                    "type": "agent_message_saved",
                    "message": {
                        "id": str(agent_message.id),
                        "role": agent_message.role,
                        "content": agent_message.content,
                        "created_at": agent_message.created_at.isoformat(),
                    },
                })


            except Exception as e:
                    
                    print("WebSocket processing error:", repr(e))

                    await websocket.send_json({
                                "type": "error",
                                "message": str(e),
                    })

    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {uid}")
