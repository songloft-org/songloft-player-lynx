"""Loopback-only real streaming fixture for the Apple cache verifier."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import sleep
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port-file", required=True)
    args = parser.parse_args()
    counters = {}
    lock = Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/stats":
                with lock:
                    body = json.dumps(counters).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            with lock:
                counters[path] = counters.get(path, 0) + 1
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.apple.mpegurl" if path == "/hls" else "audio/mpeg")
            size = 1024 * 1024 if path == "/slow" else 32768
            if path != "/unknown":
                self.send_header("Content-Length", str(size))
            self.end_headers()
            try:
                for offset in range(0, size, 4096):
                    self.wfile.write(b"m" * min(4096, size - offset))
                    self.wfile.flush()
                    if path == "/slow":
                        sleep(0.025)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Path(args.port_file).write_text(str(server.server_port), encoding="utf-8")
    server.serve_forever()


if __name__ == "__main__":
    main()
