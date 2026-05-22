import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user
from app.models.user import User
from app.services.event_bus import subscribe, unsubscribe

router = APIRouter(prefix="/sse", tags=["SSE"])


@router.get("/stream", summary="Real-time SSE event stream")
async def sse_stream(current_user: User = Depends(get_current_user)):
    queue = await subscribe()

    async def generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'user_id': current_user.id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )