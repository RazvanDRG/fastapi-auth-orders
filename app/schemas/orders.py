from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.order import OrderStatus

class OrderItemCreate(BaseModel):
    product_id: int = Field(..., example=1)
    qty: int = Field(..., example=2, gt=0)

class OrderCreate(BaseModel):
    customer_id: int = Field(..., example=1)
    reference: Optional[str] = Field(None, example="NL-ORDER-001")
    items: List[OrderItemCreate]

    class Config:
        json_schema_extra = {
            "example": {
                "customer_id": 1,
                "reference": "NL-ORDER-001",
                "items": [
                    { "product_id": 1, "qty": 2 },
                    { "product_id": 2, "qty": 1 }
                ]
            }
        }

class OrderOut(BaseModel):
    id: int
    customer_id: int
    reference: Optional[str]
    status: OrderStatus

    class Config:
        from_attributes = True