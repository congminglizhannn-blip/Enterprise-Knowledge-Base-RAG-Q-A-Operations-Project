from enum import StrEnum

from sqlalchemy import Enum


def value_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda members: [item.value for item in members])
