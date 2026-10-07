"""Loopback HTTP/self-signed HTTPS fixture for the Apple plugin-template verifier."""

import faulthandler

faulthandler.enable()
faulthandler.dump_traceback_later(10, repeat=True)
print("[template-fixture] Importing Python modules", flush=True)

import argparse
import json
import ssl
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock, Thread
from time import sleep

from loopback_http_server import LoopbackHTTPServer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port-file", required=True)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    counts = {}
    credential_headers = []
    lock = Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            with lock:
                counts[self.path] = counts.get(self.path, 0) + 1
                if self.headers.get("Authorization") or self.headers.get("Cookie"):
                    credential_headers.append(self.path)
            if self.path == "/stats":
                with lock:
                    data = json.dumps({"counts": counts, "credentials": credential_headers}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            redirects = {"/redirect": "/bundle", "/loop": "/loop",
                         "/userinfo": f"http://user:TEST_ONLY@127.0.0.1:{self.server.server_port}/bundle"}
            if self.path in redirects:
                self.send_response(302)
                self.send_header("Location", redirects[self.path])
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            data = bytes([0, 1, 127, 128, 255])
            if self.path == "/empty":
                data = b""
            elif self.path in ("/large", "/unknown"):
                data = b"x" * 32768
            elif self.path == "/slow":
                data = b"s" * 409600
            elif self.path == "/stall":
                data = b"t" * 100
            status = 404 if self.path == "/404" else 401 if self.path == "/auth" else 200
            self.send_response(status)
            if status == 401:
                self.send_header("WWW-Authenticate", 'Basic realm="template"')
            if self.path != "/unknown":
                self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                if self.path == "/stall":
                    sleep(2)
                for offset in range(0, len(data), 4096):
                    self.wfile.write(data[offset:offset + 4096])
                    self.wfile.flush()
                    if self.path == "/slow":
                        sleep(0.1)
            except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
                pass

    print("[template-fixture] Binding HTTP listener", flush=True)
    with LoopbackHTTPServer(("127.0.0.1", 0), Handler) as plain:
        print("[template-fixture] Binding HTTPS listener", flush=True)
        with LoopbackHTTPServer(("127.0.0.1", 0), Handler) as secure:
            print("[template-fixture] Loading TLS certificate", flush=True)
            tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            tls.load_cert_chain(args.cert, args.key)
            secure.socket = tls.wrap_socket(secure.socket, server_side=True)
            Thread(target=secure.serve_forever, daemon=True).start()
            # Publish only after both listeners are bound and TLS is configured.
            print("[template-fixture] Publishing listener ports", flush=True)
            Path(args.port_file).write_text(
                json.dumps({"http": plain.server_port, "https": secure.server_port}),
                encoding="utf-8",
            )
            faulthandler.cancel_dump_traceback_later()
            print("[template-fixture] Ready", flush=True)
            plain.serve_forever()


if __name__ == "__main__":
    try:
        main()
    finally:
        faulthandler.cancel_dump_traceback_later()
