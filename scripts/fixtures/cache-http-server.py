"""Loopback-only real streaming fixture for the Apple cache verifier."""

import faulthandler

faulthandler.enable()
faulthandler.dump_traceback_later(10, repeat=True)
print("[cache-fixture] Importing Python modules", flush=True)

import argparse
import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
from time import sleep
from urllib.parse import urlsplit

from loopback_http_server import LoopbackHTTPServer


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

    print("[cache-fixture] Binding HTTP listener", flush=True)
    with LoopbackHTTPServer(("127.0.0.1", 0), Handler) as server:
        print("[cache-fixture] Publishing listener port", flush=True)
        Path(args.port_file).write_text(str(server.server_port), encoding="utf-8")
        faulthandler.cancel_dump_traceback_later()
        print("[cache-fixture] Ready", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    finally:
        faulthandler.cancel_dump_traceback_later()
