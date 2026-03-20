"""
Memory Manager - Persistent World Model for Agency OS
=====================================================
Handles embedding, storage, and semantic search of memories.
Pluggable backend: LanceDB (vector) with SQLite fallback.

Author: Agency OS Team
Phase: 3 - Unified World Model
"""

import os
import sys
import json
import uuid
import time
import sqlite3
import math
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod

# Import LLM Core for embeddings
try:
    from llm_core import get_embedding, log
except ImportError:
    def log(msg): sys.stderr.write(f"[MEMORY] {msg}\n")
    def get_embedding(text, model=None): return []

# --- BACKEND INTERFACE ---
class MemoryBackend(ABC):
    @abstractmethod
    def upsert(self, id: str, text: str, vector: List[float], metadata: Dict[str, Any]):
        pass

    @abstractmethod
    def search(self, vector: List[float], k: int = 5) -> List[Dict[str, Any]]:
        pass

# --- LANCEDB BACKEND (Primary) ---
class LanceDBBackend(MemoryBackend):
    def __init__(self, uri: str = "data/lancedb", table_name: str = "world_model"):
        self.uri = uri
        self.table_name = table_name
        self.db = None
        self.table = None
        self._initialized = False
        
        try:
            import lancedb
            import pandas as pd
            os.makedirs(uri, exist_ok=True)
            self.db = lancedb.connect(uri)
            self._initialized = True
            log(f"LanceDB connected at {uri}")
        except ImportError:
            log("LanceDB not installed. Falling back to SQLite.")
        except Exception as e:
            log(f"LanceDB init failed: {e}. Falling back to SQLite.")

    def _ensure_table(self, vector_dim: int):
        if not self._initialized or self.table is not None:
            return
        
        if self.table_name not in self.db.table_names():
            # Create table with initial dummy record to define schema
            import pandas as pd
            data = [{
                "id": "init",
                "text": "init",
                "vector": [0.0] * vector_dim,
                "metadata": "{}"
            }]
            self.table = self.db.create_table(self.table_name, data=data)
        else:
            self.table = self.db.open_table(self.table_name)

    def upsert(self, id: str, text: str, vector: List[float], metadata: Dict[str, Any]):
        if not self._initialized:
            return
        self._ensure_table(len(vector))

        import pandas as pd
        df = pd.DataFrame([{
            "id": id,
            "text": text,
            "vector": vector,
            "metadata": json.dumps(metadata)
        }])

        # Prefer native merge-upsert if available; otherwise delete+add fallback.
        merge_insert = getattr(self.table, "merge_insert", None)
        if callable(merge_insert):
            try:
                merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute(df)
                return
            except Exception as exc:
                log(f"LanceDB merge_insert failed for id={id}: {exc}. Falling back to delete+add.")

        try:
            escaped_id = id.replace("'", "''")
            self.table.delete(f"id = '{escaped_id}'")
        except Exception as exc:
            log(f"LanceDB delete-before-upsert failed for id={id}: {exc}.")

        self.table.add(df)

    def search(self, vector: List[float], k: int = 5) -> List[Dict[str, Any]]:
        if not self._initialized:
            return []
        self._ensure_table(len(vector))

        raw_results = self.table.search(vector).limit(max(k + 2, 8)).to_list()
        results: List[Dict[str, Any]] = []
        for res in raw_results:
            # Ignore schema bootstrap row if it exists.
            if str(res.get("id", "")) == "init":
                continue
            if isinstance(res.get("metadata"), str):
                try:
                    res["metadata"] = json.loads(res["metadata"])
                except Exception:
                    res["metadata"] = {}
            results.append(res)
            if len(results) >= k:
                break
        return results

# --- SQLITE BACKEND (Fallback) ---
class SQLiteBackend(MemoryBackend):
    def __init__(self, db_path: str = "agency_memory.db"):
        self.db_path = db_path
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS fallback_memory (
            id TEXT PRIMARY KEY,
            text TEXT,
            vector_json TEXT,
            metadata_json TEXT,
            timestamp REAL
        )''')
        conn.commit()
        conn.close()

    def upsert(self, id: str, text: str, vector: List[float], metadata: Dict[str, Any]):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''INSERT OR REPLACE INTO fallback_memory 
                     (id, text, vector_json, metadata_json, timestamp)
                     VALUES (?, ?, ?, ?, ?)''',
                  (id, text, json.dumps(vector), json.dumps(metadata), time.time()))
        conn.commit()
        conn.close()

    @staticmethod
    def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        if not vec_a or not vec_b:
            return 0.0
        if len(vec_a) != len(vec_b):
            return 0.0

        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        mag_a = math.sqrt(sum(a * a for a in vec_a))
        mag_b = math.sqrt(sum(b * b for b in vec_b))
        if mag_a == 0.0 or mag_b == 0.0:
            return 0.0
        return dot / (mag_a * mag_b)

    def search(self, vector: List[float], k: int = 5) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute(
            "SELECT id, text, vector_json, metadata_json, timestamp FROM fallback_memory"
        )
        rows = c.fetchall()
        conn.close()

        entries: List[Dict[str, Any]] = []
        for row in rows:
            metadata: Dict[str, Any]
            stored_vector: List[float]
            try:
                metadata = json.loads(row[3] or "{}")
            except Exception:
                metadata = {}
            try:
                parsed = json.loads(row[2] or "[]")
                stored_vector = [float(x) for x in parsed] if isinstance(parsed, list) else []
            except Exception:
                stored_vector = []
            entries.append({
                "id": row[0],
                "text": row[1],
                "vector": stored_vector,
                "metadata": metadata,
                "timestamp": float(row[4] or 0.0),
            })

        # If no query vector, fallback to recency ordering.
        if not vector:
            ordered = sorted(entries, key=lambda item: item.get("timestamp", 0.0), reverse=True)
            return [{"id": e["id"], "text": e["text"], "metadata": e["metadata"]} for e in ordered[:k]]

        for entry in entries:
            entry["score"] = self._cosine_similarity(vector, entry.get("vector", []))

        ordered = sorted(
            entries,
            key=lambda item: (float(item.get("score", 0.0)), float(item.get("timestamp", 0.0))),
            reverse=True,
        )
        return [
            {
                "id": e["id"],
                "text": e["text"],
                "metadata": e["metadata"],
                "score": round(float(e.get("score", 0.0)), 6),
            }
            for e in ordered[:k]
        ]

# --- MEMORY MANAGER ---
class MemoryManager:
    def __init__(self, lancedb_uri: str = "data/lancedb", sqlite_path: str = "agency_memory.db"):
        self.lancedb = LanceDBBackend(lancedb_uri)
        self.sqlite = SQLiteBackend(sqlite_path)

    @staticmethod
    def _normalize_vector(vector: Any) -> List[float]:
        if not isinstance(vector, list):
            return []
        normalized: List[float] = []
        for value in vector:
            try:
                normalized.append(float(value))
            except Exception:
                return []
        return normalized

    def upsert_memory(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """Add or update a memory with automatic embedding"""
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Memory text is required.")
        if metadata is not None and not isinstance(metadata, dict):
            raise ValueError("Memory metadata must be an object.")

        mem_id = str(metadata.get("id") if metadata and "id" in metadata else uuid.uuid4())
        metadata = metadata or {}
        metadata["timestamp"] = metadata.get("timestamp", time.time())

        vector = self._normalize_vector(get_embedding(text))

        # Always save to SQLite (as source of truth/backup)
        self.sqlite.upsert(mem_id, text, vector, metadata)

        # Save to LanceDB if available
        if self.lancedb._initialized and vector:
            self.lancedb.upsert(mem_id, text, vector, metadata)

        return mem_id

    def search_memory(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Search memories semantically"""
        if not isinstance(query, str) or not query.strip():
            raise ValueError("Search query is required.")
        if not isinstance(k, int):
            raise ValueError("k must be an integer.")
        if k < 1:
            raise ValueError("k must be >= 1.")

        vector = self._normalize_vector(get_embedding(query))
        if not vector:
            log("Search failed: could not generate embedding for query.")
            return self.sqlite.search([], k)

        if self.lancedb._initialized:
            return self.lancedb.search(vector, k)
        return self.sqlite.search(vector, k)

if __name__ == "__main__":
    # Smoke test
    mgr = MemoryManager()
    
    # Test Upsert
    log("Testing upsert...")
    mid = mgr.upsert_memory("The project uses Gemini CLI for automation.", {"source": "test", "tags": ["orion"]})
    log(f"Upserted memory ID: {mid}")
    
    # Test Search
    log("Testing search...")
    results = mgr.search_memory("How does the project do automation?")
    for i, res in enumerate(results):
        log(f"Result {i+1}: {res['text']} (metadata: {res['metadata']})")
