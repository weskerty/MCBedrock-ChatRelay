from typing import Any
from ruamel.yaml.comments import CommentedMap

def commented_map_to_dict(data: Any) -> Any:
    if isinstance(data, CommentedMap):
        return {k: commented_map_to_dict(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [commented_map_to_dict(v) for v in data]
    return data
