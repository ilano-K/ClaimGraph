from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
import logging 
import uvicorn

logging.basicConfig(
    filename="claim-graph.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

logger = logging.getLogger(__name__)
logger.info("Backend starting...")

app = FastAPI(title="ClaimGraph")

app.middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins
    allow_credentials=True,
    allow_methods=["*"], # Allows POST, GET, PUT, DELETE
    allow_headers=["*"], 
)

# add exception handler here

if __name__ == "__main__":
    logger.info("Starting uvicorn server")
    uvicorn.run(app, host="127.0.0.1", port=8000)