from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.db.session import get_db
from app.models.product import Product
from app.core.security import get_current_user
from app.models.user import User
from app.models.inventory_event import InventoryEvent

router = APIRouter(
    prefix="/products",
    tags=["Products"],
    dependencies=[Depends(require_roles(Roles.ADMIN, Roles.SERVICE))],
)


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    stock_qty: int

    class Config:
        from_attributes = True


class CreateProductRequest(BaseModel):
    sku: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=200)
    stock_qty: int = Field(ge=0)


class UpdateProductStockRequest(BaseModel):
    stock_qty: int = Field(ge=0)


@router.get("", response_model=list[ProductOut], summary="List products")
def list_products(db: Session = Depends(get_db)):
    return db.execute(select(Product).order_by(Product.id.asc())).scalars().all()


@router.post("", response_model=ProductOut, status_code=201, summary="Create product")
def create_product(
    payload: CreateProductRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # adăugat
):
    existing = db.scalar(select(Product).where(Product.sku == payload.sku.strip()))

    if existing:
        raise HTTPException(status_code=409, detail="SKU already exists")

    product = Product(
        sku=payload.sku.strip().upper(),
        name=payload.name.strip(),
        stock_qty=payload.stock_qty,
    )

    db.add(product)
    db.flush()  # obținem product.id înainte de commit

    if payload.stock_qty > 0:
        db.add(
            InventoryEvent(
                user_id=current_user.id,
                product_id=product.id,
                sku=product.sku,
                event_type="product_created",
                first_name=current_user.first_name,
                last_name=current_user.last_name,
                old_stock=0,
                new_stock=payload.stock_qty,
                delta=payload.stock_qty,
            )
        )

    db.commit()
    db.refresh(product)

    return product


@router.patch("/{product_id}/stock", response_model=ProductOut, summary="Update product stock")
def update_product_stock(
    product_id: int,
    payload: UpdateProductStockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.scalar(select(Product).where(Product.id == product_id))

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    old_stock = product.stock_qty
    new_stock = payload.stock_qty
    delta = new_stock - old_stock

    product.stock_qty = new_stock

    db.add(
        InventoryEvent(
            user_id=current_user.id,
            product_id=product.id,
            sku=product.sku,
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            old_stock=old_stock,
            new_stock=new_stock,
            delta=delta,
        )
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    return product

@router.get("/history", summary="Inventory stock history")
def inventory_history(db: Session = Depends(get_db)):
    events = (
        db.execute(
            select(InventoryEvent)
            .order_by(InventoryEvent.created_at.desc())
            .limit(100)
        )
        .scalars()
        .all()
    )

    return events