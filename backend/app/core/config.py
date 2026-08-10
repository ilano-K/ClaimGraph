from pathlib import Path
import os 

APP_NAME = "claim-graph"
LOCAL_APP_DATA = Path(os.getenv("LOCALAPPDATA")) / APP_NAME

LOCAL_APP_DATA.mkdir(exist_ok=True)

DATABASE_PATH = LOCAL_APP_DATA / "app.db"