from sqlalchemy import select

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import get_password_hash
from app.models.department import Department
from app.models.enums import UserRole
from app.models.knowledge_base import KnowledgeBase
from app.models.organization import Organization
from app.models.user import User


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        org = db.scalar(select(Organization).where(Organization.name == "默认组织"))
        if not org:
            org = Organization(name="默认组织")
            db.add(org)
            db.flush()
        dept = db.scalar(select(Department).where(Department.name == "默认部门", Department.org_id == org.id))
        if not dept:
            dept = Department(name="默认部门", description="系统初始化部门", org_id=org.id)
            db.add(dept)
            db.flush()
        admin = db.scalar(select(User).where(User.username == settings.initial_admin_username))
        if not admin:
            admin = User(
                username=settings.initial_admin_username,
                full_name="初始管理员",
                role=UserRole.SUPER_ADMIN,
                org_id=org.id,
                department_id=dept.id,
                hashed_password=get_password_hash(settings.initial_admin_password),
                is_active=True,
            )
            db.add(admin)
            db.flush()
        elif not admin.org_id:
            admin.org_id = org.id
        kb = db.scalar(select(KnowledgeBase).where(KnowledgeBase.name == "产品制度知识库", KnowledgeBase.department_id == dept.id))
        if not kb:
            db.add(
                KnowledgeBase(
                    name="产品制度知识库",
                    description="默认演示知识库，用于本地上传、入库和问答联调。",
                    org_id=org.id,
                    department_id=dept.id,
                    created_by=admin.id,
                )
            )
        db.commit()
        print("initial admin and default knowledge base ensured")
    finally:
        db.close()


if __name__ == "__main__":
    main()
