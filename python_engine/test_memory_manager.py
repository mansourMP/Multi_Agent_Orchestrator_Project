import unittest
import os
import shutil
import json
from unittest.mock import patch, MagicMock
from memory_manager import MemoryManager, LanceDBBackend, SQLiteBackend

class TestMemoryManager(unittest.TestCase):
    def setUp(self):
        self.test_lancedb_uri = "test_data/lancedb"
        self.test_sqlite_path = "test_agency_memory.db"
        # Cleanup previous test data
        if os.path.exists("test_data"):
            shutil.rmtree("test_data")
        if os.path.exists(self.test_sqlite_path):
            os.remove(self.test_sqlite_path)
            
        self.mgr = MemoryManager(self.test_lancedb_uri, self.test_sqlite_path)

    def tearDown(self):
        # Cleanup test data
        if os.path.exists("test_data"):
            shutil.rmtree("test_data")
        if os.path.exists(self.test_sqlite_path):
            os.remove(self.test_sqlite_path)

    @patch('memory_manager.get_embedding')
    def test_upsert_and_search(self, mock_embedding):
        # Mock embedding to return a deterministic vector
        mock_embedding.return_value = [0.1, 0.2, 0.3]
        
        text = "This is a test memory."
        metadata = {"source": "unit_test", "key": "value"}
        
        # Test Upsert
        mem_id = self.mgr.upsert_memory(text, metadata)
        self.assertIsNotNone(mem_id)
        
        # Verify in SQLite
        results = self.mgr.sqlite.search([0.1, 0.2, 0.3], k=1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['text'], text)
        self.assertEqual(results[0]['metadata']['source'], "unit_test")
        
        # Test Search
        search_results = self.mgr.search_memory("test query", k=1)
        self.assertGreaterEqual(len(search_results), 1)
        self.assertEqual(search_results[0]['text'], text)

    @patch('memory_manager.get_embedding')
    def test_fallback_logic(self, mock_embedding):
        # Force LanceDB to be uninitialized
        self.mgr.lancedb._initialized = False
        
        mock_embedding.return_value = [0.5, 0.5, 0.5]
        text = "Fallback test memory."
        
        self.mgr.upsert_memory(text)
        
        # Should still work via SQLite
        results = self.mgr.search_memory("any query")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['text'], text)

    def test_sqlite_semantic_ranking(self):
        backend = SQLiteBackend(self.test_sqlite_path)
        backend.upsert("a", "alpha memory", [1.0, 0.0, 0.0], {"source": "unit_test"})
        backend.upsert("b", "beta memory", [0.0, 1.0, 0.0], {"source": "unit_test"})

        results = backend.search([1.0, 0.0, 0.0], k=2)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], "a")
        self.assertGreaterEqual(results[0].get("score", 0.0), results[1].get("score", 0.0))

    def test_validation_errors(self):
        with self.assertRaises(ValueError):
            self.mgr.upsert_memory("")
        with self.assertRaises(ValueError):
            self.mgr.upsert_memory("valid text", metadata="not-a-dict")
        with self.assertRaises(ValueError):
            self.mgr.search_memory("")
        with self.assertRaises(ValueError):
            self.mgr.search_memory("valid query", k=0)
        with self.assertRaises(ValueError):
            self.mgr.search_memory("valid query", k="2")

if __name__ == '__main__':
    unittest.main()
