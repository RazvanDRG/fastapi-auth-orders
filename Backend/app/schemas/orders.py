from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.order import OrderStatus

class OrderItemCreate(BaseModel):
    product_id: int = Field(..., examples=[1])
    qty: int = Field(..., examples=[2], gt=0)

class OrderCreate(BaseModel):
    customer_id: int = Field(..., examples=[1])
    reference: Optional[str] = Field(None, examples=["NL-ORDER-001"])
    items: List[OrderItemCreate]

    model_config = {
        "examples": [
                {
                    "customer_id": 1,
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