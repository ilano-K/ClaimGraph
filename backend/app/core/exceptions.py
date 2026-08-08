class AppException(Exception):
    status_code: int = 500
    detail: str = "Internal Server Error"

class GraphCompilationError(AppException):
    status_code: int = 500 
    detail: str = "Graph Compile Error"