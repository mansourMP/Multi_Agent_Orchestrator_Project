from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules import mini_app_host_service
from server_modules import calorie_tracking_service
from server_modules import flashcards_tracking_service
from server_modules import mini_app_invoke_service
from server_modules import mini_apps_service


router = APIRouter()
get_current_user = auth_module.get_current_user


class MiniAppContractUpsertRequest(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    delivery_mode: Optional[str] = None
    hosted_url: Optional[str] = None
    embed_kind: Optional[str] = None
    allowed_origins: Optional[List[str]] = None
    bridge_contracts: Optional[Dict[str, List[str]]] = None
    permissions: Optional[List[str]] = None
    context_envelope: Optional[Dict[str, List[str]]] = None
    current_state: Optional[Dict[str, Any]] = None
    recent_events: Optional[List[Dict[str, Any]]] = None
    daily_summary: Optional[Dict[str, Any]] = None
    weekly_summary: Optional[Dict[str, Any]] = None
    long_term_facts: Optional[List[Any]] = None
    records: Optional[List[Dict[str, Any]]] = None


class MiniAppRetrieveRecordsRequest(BaseModel):
    ids: Optional[List[str]] = None
    kind: Optional[str] = None
    tag: Optional[str] = None
    tags: Optional[List[str]] = None
    since: Optional[str] = None
    until: Optional[str] = None
    text_query: Optional[str] = None
    limit: int = Field(default=mini_apps_service.DEFAULT_RETRIEVE_LIMIT, ge=1, le=mini_apps_service.MAX_RETRIEVE_LIMIT)


class CalorieEventLogRequest(BaseModel):
    id: Optional[str] = None
    meal_label: Optional[str] = None
    calories: Optional[float] = Field(default=None, ge=0)
    protein_g: Optional[float] = Field(default=None, ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    timestamp: Optional[str] = None
    tags: Optional[List[str]] = None
    explicit_user_intent: bool = False


class CalorieGoalsRequest(BaseModel):
    calorie_goal: Optional[float] = Field(default=None, ge=0)
    protein_goal_g: Optional[float] = Field(default=None, ge=0)
    carbs_goal_g: Optional[float] = Field(default=None, ge=0)
    fat_goal_g: Optional[float] = Field(default=None, ge=0)
    explicit_user_intent: bool = False


class FlashcardCreateRequest(BaseModel):
    id: Optional[str] = None
    deck: Optional[str] = None
    topic: Optional[str] = None
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None
    timestamp: Optional[str] = None
    explicit_user_intent: bool = False


class FlashcardDeckMetadataRequest(BaseModel):
    deck: str = Field(min_length=1)
    topic_focus: Optional[str] = None
    language: Optional[str] = None
    target_new_per_day: Optional[int] = Field(default=None, ge=0)
    target_reviews_per_day: Optional[int] = Field(default=None, ge=0)
    tags: Optional[List[str]] = None
    timestamp: Optional[str] = None
    explicit_user_intent: bool = False


class FlashcardReviewRequest(BaseModel):
    id: Optional[str] = None
    card_id: Optional[str] = None
    deck: str = Field(min_length=1)
    topic: Optional[str] = None
    correct: Optional[bool] = None
    quality: Optional[int] = Field(default=None, ge=0, le=5)
    response_ms: Optional[int] = Field(default=None, ge=0)
    tags: Optional[List[str]] = None
    timestamp: Optional[str] = None
    explicit_user_intent: bool = False


class FlashcardRetrieveRequest(BaseModel):
    deck: Optional[str] = None
    topic: Optional[str] = None
    since: Optional[str] = None
    until: Optional[str] = None
    kind: Optional[str] = None
    limit: int = Field(default=mini_apps_service.DEFAULT_RETRIEVE_LIMIT, ge=1, le=mini_apps_service.MAX_RETRIEVE_LIMIT)


class FlashcardGenerateRequest(BaseModel):
    deck: str = Field(min_length=1)
    source_text: str = Field(min_length=1)
    topic: Optional[str] = None
    language: Optional[str] = None
    count: int = Field(default=flashcards_tracking_service.DEFAULT_GENERATED_CARD_COUNT, ge=1, le=flashcards_tracking_service.MAX_GENERATED_CARD_COUNT)
    provider: Optional[str] = None
    model: Optional[str] = None
    explicit_user_intent: bool = False


class MiniAppInvokeRequest(BaseModel):
    input: Optional[str] = None
    prompt: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class HostedMiniAppBridgeRequest(BaseModel):
    origin: str = Field(min_length=1)
    bridge_kind: str = Field(min_length=1)
    bridge_type: str = Field(min_length=1)
    request_text: Optional[str] = None
    target: Optional[Dict[str, Any]] = None
    context_envelope: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


def _write_authorization(current_user: Dict[str, Any], *, explicit_user_intent: bool) -> Dict[str, Any]:
    return {
        "explicit_user_intent": bool(explicit_user_intent),
        "actor_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
        "approval_source": "mini_app_route",
    }


@router.get("/workspaces/{workspace_id}/mini-apps")
async def list_mini_apps(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    return mini_apps_service.list_mini_app_contracts(resolved_workspace_id)


@router.get("/workspaces/{workspace_id}/mini-apps/{app_id}")
async def get_mini_app_contract(
    workspace_id: str,
    app_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    try:
        return mini_apps_service.get_mini_app_contract(resolved_workspace_id, app_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/workspaces/{workspace_id}/mini-apps/{app_id}")
async def upsert_mini_app_contract(
    workspace_id: str,
    app_id: str,
    body: MiniAppContractUpsertRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return mini_apps_service.upsert_mini_app_contract(
            resolved_workspace_id,
            app_id,
            label=body.label,
            description=body.description,
            delivery_mode=body.delivery_mode,
            hosted_url=body.hosted_url,
            embed_kind=body.embed_kind,
            allowed_origins=body.allowed_origins,
            bridge_contracts=body.bridge_contracts,
            permissions=body.permissions,
            context_envelope=body.context_envelope,
            current_state=body.current_state,
            recent_events=body.recent_events,
            daily_summary=body.daily_summary,
            weekly_summary=body.weekly_summary,
            long_term_facts=body.long_term_facts,
            records=body.records,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/{app_id}/records/retrieve")
async def retrieve_mini_app_records(
    workspace_id: str,
    app_id: str,
    body: MiniAppRetrieveRecordsRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    try:
        return mini_apps_service.retrieve_mini_app_records(
            resolved_workspace_id,
            app_id,
            filters=body.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/workspaces/{workspace_id}/mini-apps/{app_id}/hosted-manifest")
async def get_hosted_mini_app_manifest(
    workspace_id: str,
    app_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    try:
        return mini_apps_service.get_hosted_mini_app_manifest(resolved_workspace_id, app_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/{app_id}/bridge/messages")
async def bridge_hosted_mini_app_message(
    workspace_id: str,
    app_id: str,
    body: HostedMiniAppBridgeRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    tenant_id = auth_module.workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        contract = mini_apps_service.get_mini_app_contract(resolved_workspace_id, app_id)
        return await mini_app_host_service.process_hosted_bridge_request(
            workspace_id=resolved_workspace_id,
            tenant_id=tenant_id,
            current_user=current_user,
            app_contract=contract,
            origin=body.origin,
            bridge_kind=body.bridge_kind,
            bridge_type=body.bridge_type,
            request_text=str(body.request_text or "").strip(),
            target=body.target,
            context_envelope=body.context_envelope,
            metadata=body.metadata,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/{app_id}/invoke")
async def invoke_mini_app(
    workspace_id: str,
    app_id: str,
    body: MiniAppInvokeRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    body_input = str(body.input or body.prompt or "").strip()
    try:
        return mini_app_invoke_service.invoke_mini_app(
            resolved_workspace_id,
            app_id,
            body_input,
            requested_provider=str(body.provider or "").strip(),
            requested_model=str(body.model or "").strip(),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/calorie_tracking/events")
async def log_calorie_event(
    workspace_id: str,
    body: CalorieEventLogRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return calorie_tracking_service.log_calorie_event(
            resolved_workspace_id,
            body.model_dump(exclude_none=True, exclude={"explicit_user_intent"}),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/workspaces/{workspace_id}/mini-apps/calorie_tracking/goals")
async def update_calorie_goals(
    workspace_id: str,
    body: CalorieGoalsRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return calorie_tracking_service.update_calorie_goals(
            resolved_workspace_id,
            body.model_dump(exclude_unset=True, exclude_none=False, exclude={"explicit_user_intent"}),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/workspaces/{workspace_id}/mini-apps/calorie_tracking/overview")
async def calorie_overview(
    workspace_id: str,
    date: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    return calorie_tracking_service.calorie_overview(
        resolved_workspace_id,
        date_filter=date,
    )


@router.post("/workspaces/{workspace_id}/mini-apps/flashcards/cards")
async def create_flashcard(
    workspace_id: str,
    body: FlashcardCreateRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return flashcards_tracking_service.create_flashcard(
            resolved_workspace_id,
            body.model_dump(exclude_none=True, exclude={"explicit_user_intent"}),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/flashcards/generate")
async def generate_flashcards(
    workspace_id: str,
    body: FlashcardGenerateRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return flashcards_tracking_service.generate_flashcards(
            resolved_workspace_id,
            deck=body.deck,
            source_text=body.source_text,
            topic=body.topic,
            language=body.language,
            count=body.count,
            requested_provider=str(body.provider or "").strip(),
            requested_model=str(body.model or "").strip(),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.put("/workspaces/{workspace_id}/mini-apps/flashcards/decks")
async def update_flashcard_deck_metadata(
    workspace_id: str,
    body: FlashcardDeckMetadataRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return flashcards_tracking_service.update_deck_metadata(
            resolved_workspace_id,
            body.model_dump(exclude_none=True, exclude={"explicit_user_intent"}),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/mini-apps/flashcards/reviews")
async def log_flashcard_review_result(
    workspace_id: str,
    body: FlashcardReviewRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return flashcards_tracking_service.log_review_result(
            resolved_workspace_id,
            body.model_dump(exclude_none=True, exclude={"explicit_user_intent"}),
            write_authorization=_write_authorization(
                current_user,
                explicit_user_intent=body.explicit_user_intent,
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/workspaces/{workspace_id}/mini-apps/flashcards/overview")
async def flashcards_overview(
    workspace_id: str,
    date: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    return flashcards_tracking_service.flashcards_overview(
        resolved_workspace_id,
        date_filter=date,
    )


@router.post("/workspaces/{workspace_id}/mini-apps/flashcards/records")
async def retrieve_flashcard_records(
    workspace_id: str,
    body: FlashcardRetrieveRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    try:
        return flashcards_tracking_service.retrieve_flashcard_records(
            resolved_workspace_id,
            deck=body.deck,
            topic=body.topic,
            since=body.since,
            until=body.until,
            kind=body.kind,
            limit=body.limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
