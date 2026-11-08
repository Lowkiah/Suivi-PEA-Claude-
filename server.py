#!/usr/bin/env python3
"""Serveur local du Suivi PEA.

Sert l'application et relaie les cours Yahoo Finance (le navigateur ne peut pas
interroger Yahoo directement à cause des restrictions CORS).

    python3 server.py            -> http://localhost:8000
    python3 server.py 8080       -> port personnalisé
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_TTL = 30  # secondes
_cache = {}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-=^]{1,20}$")
ALLOWED = {"range": {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"},
           "interval": {"1m", "5m", "15m", "1h", "1d", "1wk", "1mo"}}


def fetch_chart(symbol, params):
    key = (symbol, params)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1], hit[2]
    last_err = (502, b'{"error":"indisponible"}')
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{urllib.parse.quote(symbol)}?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SuiviPEA)", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read()
            _cache[key] = (time.time(), 200, body)
            return 200, body
        except urllib.error.HTTPError as e:
            last_err = (e.code, e.read() or b"{}")
        except Exception as e:  # réseau, timeout…
            last_err = (502, json.dumps({"error": str(e)}).encode())
    return last_err


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/chart/"):
            symbol = urllib.parse.unquote(parsed.path[len("/api/chart/"):])
            if not SYMBOL_RE.match(symbol):
                return self._json(400, b'{"error":"symbole invalide"}')
            q = urllib.parse.parse_qs(parsed.query)
            params = urllib.parse.urlencode({
                k: (q.get(k, [d])[0] if q.get(k, [d])[0] in ALLOWED[k] else d)
                for k, d in (("range", "5y"), ("interval", "1d"))
            })
            code, body = fetch_chart(symbol, params)
            return self._json(code, body)
        if parsed.path == "/api/ping":
            return self._json(200, b'{"ok":true}')
        return super().do_GET()

    def _json(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "/api/" not in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"Suivi PEA : http://localhost:{port}  (Ctrl+C pour arrêter)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
