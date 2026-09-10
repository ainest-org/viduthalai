from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MRAssigneeCreate(BaseModel):
    user_id: int


class MRAssigneeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: str
    email: str
    created_at: datetime
