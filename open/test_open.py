import unittest
import os
import tempfile
import sys
from io import StringIO
from unittest.mock import patch

# Ensure repo root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import open.open as open_module

class TestOpenScript(unittest.TestCase):
    def test_parse_args_with_files(self):
        args = open_module.parse_args(['file1.txt', 'file2.pdf'])
        self.assertEqual(args.files, ['file1.txt', 'file2.pdf'])

    def test_parse_args_no_files(self):
        args = open_module.parse_args([])
        self.assertEqual(args.files, [])

    def test_get_all_links_specific_file(self):
        with tempfile.NamedTemporaryFile('w+', suffix='.custom', delete=False) as f:
            f.write("Check out https://example.com and http://test.org/path")
            f_path = f.name

        try:
            links = open_module.get_all_links([f_path], open_module.ALLOWED_SCHEMES)
            self.assertEqual(links, ['https://example.com', 'http://test.org/path'])
        finally:
            if os.path.exists(f_path):
                os.remove(f_path)

    @patch('webbrowser.open')
    @patch('builtins.input', return_value='')
    def test_main_with_specific_file(self, mock_input, mock_browser):
        with tempfile.NamedTemporaryFile('w+', suffix='.custom', delete=False) as f:
            f.write("Link: https://example.com")
            f_path = f.name

        try:
            captured_output = StringIO()
            with patch('sys.stdout', captured_output):
                open_module.main([f_path])

            self.assertIn("Processing specified file(s)", captured_output.getvalue())
            self.assertIn("Found 1 unique links", captured_output.getvalue())
        finally:
            if os.path.exists(f_path):
                os.remove(f_path)

if __name__ == '__main__':
    unittest.main()
