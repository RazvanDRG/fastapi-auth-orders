from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import OrderStatus

# Read models for the service role. They carry ids, statuses and timestamps
# only: no emails, names or other personal data.


class IntegrationOrderSummaryOut(BaseModel):
    id: int
    reference: str | None = None
    source_company: str | None = None
    status: OrderStatus
    assigned_operator_id: int | None = None
    # Derived from order_events (first and last event): orders has no timestamp columns.
    created_at: datetime | None = None
    updated_at: datetime | None = None


class IntegrationOrderPage(BaseModel):
    items: list[IntegrationOrderSummaryOut]
    next_cursor: str | None = None


class IntegrationOrderItemOut(BaseModel):
    product_id: int
    sku: str | None = None
    qty: int


class IntegrationStatusChangeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # "from" is a Python keyword, so the field is exposed through an alias.
    from_status: str | None = Field(None, serialization_alias="from")
    to_status: str | None = Field(None, serialization_alias="to")
    action: str
    actor_role: str | None = None
    time: datetime


class IntegrationOrderDetailOut(IntegrationOrderSummaryOut):
    items: list[IntegrationOrderItemOut]
    history: list[IntegrationStatusChangeOut]


class IntegrationOutboxEventOut(BaseModel):
    event_id: UUID
    event_type: str
    order_id: int
    occurred_at: datetime
    published: bool
    published_at: datetime | None = None


class IntegrationOutboxEventPage(BaseModel):
    items: list[IntegrationOutboxEventOut]
    next_cursor: str | None = None


class IntegrationProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    stock_qty: int
