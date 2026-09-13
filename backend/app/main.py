from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, chat, documents, knowledge_bases, processes, sessions, upload
from app.core.config import settings


app = FastAPI(
    title="企业知识库 RAG 问答系统 API",
    version="0.1.0",
    description="FastAPI backend for enterprise knowledge base RAG Q&A.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(knowledge_bases.router, prefix="/api/kbs", tags=["knowledge-bases"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(processes.router, prefix="/api/processes", tags=["processes"])


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
