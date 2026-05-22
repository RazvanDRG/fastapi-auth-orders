import asyncio
from typing import Any

_subscribers: set[asyncio.Queue] = set()


async def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def publish(event: dict[str, Any]) -> None:
    dead = set()
    for q in _subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.add(q)
    for q in dead:
        _subscribers.discard(q)