from __future__ import annotations


def register_inbox_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    @app.get("/events/inbox", dependencies=[Depends(require_api_key)])
    async def get_channel_events(
        limit: int = 80,
        workspace_id: Optional[str] = None,
        channel: Optional[str] = None,
        session_key: Optional[str] = None,
        direction: Optional[str] = None,
        action: Optional[str] = None,
        run_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        include_sessions: bool = True,
        session_limit: int = ORION_CHANNEL_SESSIONS_LIMIT,
    ):
        safe_limit = max(1, min(limit, 500))
        with CHANNEL_EVENTS_LOCK:
            items = list(CHANNEL_EVENTS)
        filtered = [
            item
            for item in items
            if _channel_event_matches(
                item=item,
                workspace_id=workspace_id,
                channel=channel,
                session_key=session_key,
                direction=direction,
                action=action,
                run_id=run_id,
                trace_id=trace_id,
            )
        ]
        payload = filtered[:safe_limit]
        sessions: List[Dict[str, Any]] = []
        if include_sessions:
            sessions = _summarize_channel_sessions(filtered, limit=session_limit)
        return {
            "items": payload,
            "count": len(payload),
            "total": len(filtered),
            "sessions": sessions,
            "session_count": len(sessions),
        }

    @app.get("/events/inbox/stream", dependencies=[Depends(require_api_key)])
    async def stream_channel_events(
        workspace_id: Optional[str] = None,
        channel: Optional[str] = None,
        session_key: Optional[str] = None,
        direction: Optional[str] = None,
        action: Optional[str] = None,
        run_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        since_id: Optional[str] = None,
        since_ts: Optional[str] = None,
        include_backlog: bool = False,
        poll_seconds: float = 0.35,
        heartbeat_seconds: float = 5.0,
        timeout_seconds: float = 25.0,
        limit: int = 120,
    ):
        safe_heartbeat = max(1.0, min(float(heartbeat_seconds), 60.0))
        return EventSourceResponse(
            _iter_channel_events_stream(
                workspace_id=workspace_id,
                channel=channel,
                session_key=session_key,
                direction=direction,
                action=action,
                run_id=run_id,
                trace_id=trace_id,
                since_id=since_id,
                since_ts=since_ts,
                include_backlog=include_backlog,
                poll_seconds=poll_seconds,
                heartbeat_seconds=heartbeat_seconds,
                timeout_seconds=timeout_seconds,
                limit=limit,
            ),
            ping=max(3, int(safe_heartbeat)),
        )

    @app.get("/events/inbox/sessions", dependencies=[Depends(require_api_key)])
    async def get_channel_sessions(
        limit: int = ORION_CHANNEL_SESSIONS_LIMIT,
        workspace_id: Optional[str] = None,
        channel: Optional[str] = None,
        session_key: Optional[str] = None,
        direction: Optional[str] = None,
        action: Optional[str] = None,
        run_id: Optional[str] = None,
        trace_id: Optional[str] = None,
    ):
        safe_limit = max(1, min(limit, max(1, ORION_CHANNEL_SESSIONS_LIMIT)))
        with CHANNEL_EVENTS_LOCK:
            items = list(CHANNEL_EVENTS)
        filtered = [
            item
            for item in items
            if _channel_event_matches(
                item=item,
                workspace_id=workspace_id,
                channel=channel,
                session_key=session_key,
                direction=direction,
                action=action,
                run_id=run_id,
                trace_id=trace_id,
            )
        ]
        sessions_all = _summarize_channel_sessions(filtered, limit=None)
        payload = sessions_all[:safe_limit]
        return {
            "items": payload,
            "count": len(payload),
            "total": len(sessions_all),
        }

    @app.get("/channels/events/trace", dependencies=[Depends(require_api_key)])
    async def get_channel_event_trace(
        run_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        channel: Optional[str] = None,
        limit: int = 200,
    ):
        if not str(run_id or "").strip() and not str(trace_id or "").strip():
            raise HTTPException(status_code=400, detail="run_id or trace_id is required.")
        safe_limit = max(1, min(limit, 500))
        run_id_value = str(run_id or "").strip()
        trace_id_value = str(trace_id or "").strip()
        with CHANNEL_EVENTS_LOCK:
            snapshot = list(CHANNEL_EVENTS)
        ordered = list(reversed(snapshot))
        items: List[Dict[str, Any]] = []
        for item in ordered:
            if not isinstance(item, dict):
                continue
            if workspace_id and str(item.get("workspace_id") or "").strip() != _normalize_workspace_id(workspace_id):
                continue
            if channel and str(item.get("channel") or "").strip().lower() != str(channel).strip().lower():
                continue
            if run_id_value and str(item.get("run_id") or "").strip() != run_id_value:
                continue
            item_trace = str(item.get("trace_id") or "").strip()
            if trace_id_value and item_trace != trace_id_value:
                continue
            items.append(item)
        payload = items[-safe_limit:] if len(items) > safe_limit else items
        trace_values = []
        seen_traces = set()
        for item in payload:
            token = str(item.get("trace_id") or "").strip()
            if token and token not in seen_traces:
                seen_traces.add(token)
                trace_values.append(token)
        return {
            "items": payload,
            "count": len(payload),
            "trace_ids": trace_values,
            "run_id": run_id_value or None,
            "trace_id": trace_id_value or None,
        }

    @app.get("/channels/events/dead_letters", dependencies=[Depends(require_api_key)])
    async def get_channel_dead_letters(limit: int = 80, channel: Optional[str] = None, run_id: Optional[str] = None):
        safe_limit = max(1, min(limit, 500))
        payload = _safe_read_json(ORION_CHANNEL_DEAD_LETTER_FILE, {"version": 1, "items": []})
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        filtered: List[Dict[str, Any]] = []
        channel_value = str(channel or "").strip().lower()
        run_value = str(run_id or "").strip()
        for item in items:
            if not isinstance(item, dict):
                continue
            if channel_value and str(item.get("channel") or "").strip().lower() != channel_value:
                continue
            if run_value and str(item.get("run_id") or "").strip() != run_value:
                continue
            filtered.append(item)
        return {
            "items": filtered[:safe_limit],
            "count": len(filtered[:safe_limit]),
            "total": len(filtered),
            "source_file": str(ORION_CHANNEL_DEAD_LETTER_FILE),
            "limit_configured": int(ORION_CHANNEL_DEAD_LETTER_LIMIT),
        }
