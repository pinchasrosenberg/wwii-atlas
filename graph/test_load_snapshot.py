"""Safety rails of the snapshot loader (no database needed)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from load_snapshot import check_target, ident  # noqa: E402


class TargetTests(unittest.TestCase):
    def test_accepts_encrypted_remote_hosts(self):
        check_target("neo4j+s://abcd1234.databases.neo4j.io")
        check_target("bolt+s://graph.example.org:7687")

    def test_rejects_local_private_and_unencrypted_targets(self):
        for uri in ("bolt://127.0.0.1:7687", "neo4j://localhost:7687", "neo4j+s://localhost",
                    "neo4j+s://127.0.0.1", "neo4j+s://10.1.2.3", "neo4j+s://192.168.0.5", "neo4j+s://[::1]",
                    "neo4j+s://graph.local", "neo4j://abcd1234.databases.neo4j.io", "http://example.org"):
            with self.assertRaises(SystemExit, msg=uri):
                check_target(uri)


class IdentTests(unittest.TestCase):
    def test_labels_are_quoted_and_validated(self):
        self.assertEqual(ident("Battle"), "`Battle`")
        for bad in ("Battle`) DETACH DELETE n //", "1abc", "", "a b", "x" * 80):
            with self.assertRaises(ValueError, msg=bad):
                ident(bad)


if __name__ == "__main__":
    unittest.main()
