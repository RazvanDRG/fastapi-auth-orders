from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.order import OrderStatus
from datetime import datetime

class OrderItemCreate(BaseModel):
    product_id: int = Field(..., examples=[1])
    qty: int = Field(..., examples=[2], gt=0)

class OrderCreate(BaseModel):
    reference: Optional[str] = Field(None, examples=["NL-ORDER-001"])
    items: List[OrderItemCreate]

    model_config = {
        "examples": [
            {
                "reference": "NL-ORDER-001",
                "items": [
                    {"product_id": 1, "qty": 2},
                    {"product_id": 2, "qty": 1}
                ]
            }
        ]
    }
    

class OrderItemOut(BaseModel):
    product_id: int
    qty: int
    product_name: str | None = None

    class Config:
        from_attributes = True
        
class OrderOut(BaseModel):
    id: int
    customer_id: int
    reference: Optional[str]
    status: OrderStatus
    items: list[OrderItemOut] = []

    class Config:
        from_attributes = True
        
class OrderEventOut(BaseModel):
    id: int
    order_id: int
    action: str
    from_status: str | None = None
    to_status: str | None = None
    actor_user_id: int | None = None
    actor_role: str | None = None
    request_id: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True