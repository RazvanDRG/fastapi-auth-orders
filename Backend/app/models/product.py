from sqlalchemy import Column, Integer, String
from app.db.base import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    stock_qty = Column(Integer, nullable=False, default=0)
