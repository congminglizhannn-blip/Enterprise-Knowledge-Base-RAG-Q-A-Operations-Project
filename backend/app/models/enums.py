from enum import StrEnum


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    DEPT_ADMIN = "dept_admin"
    USER = "user"


class DocumentStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentType(StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    LINK = "link"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
