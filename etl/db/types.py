"""טיפוס גיאומטריה דו-דיאלקטי.

הבעיה: GeoAlchemy2 עובד מצוין מול PostGIS ולא קיים ב-SQLite רגיל. הפתרון —
TypeDecorator שמאחסן WKB מול PostGIS ו-WKT מול SQLite, ומחזיר בשני המקרים
אובייקט Shapely. הקוד למעלה לא יודע באיזה דיאלקט הוא רץ.
"""
from __future__ import annotations

from shapely import wkb, wkt
from shapely.geometry.base import BaseGeometry
from sqlalchemy import String, TypeDecorator

from config.settings import SRID


class Geometry(TypeDecorator):
    """עמודת גיאומטריה שעובדת גם ב-PostGIS וגם ב-SQLite."""

    impl = String
    cache_ok = True

    def __init__(self, geometry_type: str = "GEOMETRY", srid: int = SRID):
        self.geometry_type = geometry_type
        self.srid = srid
        super().__init__()

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from geoalchemy2 import Geometry as PGGeometry
            return dialect.type_descriptor(
                PGGeometry(geometry_type=self.geometry_type, srid=self.srid)
            )
        return dialect.type_descriptor(String())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, BaseGeometry):
            if dialect.name == "postgresql":
                return f"SRID={self.srid};{value.wkt}"
            return value.wkt
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (bytes, bytearray, memoryview)):
            return wkb.loads(bytes(value))
        if isinstance(value, str):
            # PostGIS מחזיר hex-WKB; SQLite מחזיר WKT
            s = value.strip()
            if s.upper().startswith(("POINT", "LINESTRING", "POLYGON",
                                     "MULTIPOINT", "MULTILINESTRING",
                                     "MULTIPOLYGON", "GEOMETRYCOLLECTION")):
                return wkt.loads(s)
            try:
                return wkb.loads(bytes.fromhex(s))
            except ValueError:
                return None
        return value


Point = lambda: Geometry("POINT")            # noqa: E731
LineString = lambda: Geometry("LINESTRING")  # noqa: E731
Polygon = lambda: Geometry("MULTIPOLYGON")   # noqa: E731
