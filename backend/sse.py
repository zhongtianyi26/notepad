"""SSE（Server-Sent Events）— 项目数据变更实时通知。

写操作完成后广播事件（携带 project_id），前端 EventSource 订阅后
立即拉取最新数据，替代轮询，把同步延迟从秒级降到毫秒级。

采用全局订阅：所有客户端共享一条事件流，前端按 project_id 自行过滤。
单进程部署下用内存广播；多 worker / 多实例需换成 Redis pub/sub。
"""

import asyncio
import json
import queue

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api")

# 全局订阅者集合（线程安全 queue.Queue，供线程池中的写操作 put）
_subscribers: set[queue.Queue] = set()


def _subscribe() -> queue.Queue:
    q = queue.Queue()
    _subscribers.add(q)
    return q


def _unsubscribe(q: queue.Queue) -> None:
    _subscribers.discard(q)


def broadcast(project_id: str) -> None:
    """向所有 SSE 连接推送更新事件（同步、线程安全）。"""
    payload = json.dumps({"project_id": project_id})
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except queue.Full:
            pass


@router.get("/events")
async def events(request: Request):
    """全局 SSE 端点：推送所有项目的变更，事件名为 `update`。"""
    q = _subscribe()

    async def event_gen():
        try:
            yield "event: hello\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.to_thread(q.get, True, 15.0)
                    yield f"event: update\ndata: {payload}\n\n"
                except queue.Empty:
                    # 15 秒无事件 → 发心跳，防止连接被代理/超时断开
                    yield ": ping\n\n"
        finally:
            _unsubscribe(q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
