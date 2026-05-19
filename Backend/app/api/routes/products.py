from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import require_roles
from app.core.roles import Roles
from app.db.session import get_db
from app.models.product import Product

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
def create_product(payload: CreateProductRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(Product).where(Product.sku == payload.sku.strip()))

    if existing:
        raise HTTPException(status_code=409, detail="SKU already exists")

    product = Product(
        sku=payload.sku.strip().upper(),
        name=payload.name.strip(),
        stock_qty=payload.stock_qty,
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    return product


@router.patch("/{product_id}/stock", response_model=ProductOut, summary="Update product stock")
def update_product_stock(
    product_id: int,
    payload: UpdateProductStockRequest,
    db: Session = Depends(get_db),
):
    product = db.scalar(select(Product).where(Product.id == product_id))

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.stock_qty = payload.stock_qty

    db.add(product)
    db.commit()
    db.refresh(product)

    return product