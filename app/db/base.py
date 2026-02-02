from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass

from app.models import user, customer, product, order, order_item