#!/usr/bin/env python3
"""Japanisch Trainer server: serves the web app and stores the data as JSON files.

Data layout in the data directory:
  shared.json            profiles and the vocabulary list everybody shares
  users/<profile>.json   statistics and settings of one profile

Behind Home Assistant ingress, the Supervisor adds the logged-in user as
X-Remote-User-Id / X-Remote-User-Display-Name headers. The app offers a profile
linked to that user; with a shared Home Assistant account, people pick or add
their own profile in the app instead.
"""

import argparse
import json
import os
import re
import tempfile
import threading
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_BODY = 5 * 1024 * 1024
WORD_LIMITS = {"de": 200, "jp": 200, "kana": 200, "note": 500}

lock = threading.Lock()
config = {"data": "data", "trusted": None}


def data_path(*parts):
    return os.path.join(config["data"], *parts)


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(path, value):
    # Write to a temporary file first so a crash never leaves half a file behind.
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
    os.replace(tmp, path)


def load_shared():
    shared = read_json(data_path("shared.json"), {})
    shared.setdefault("profiles", [])
    shared.setdefault("words", [])
    return shared


def clean_word(raw, existing=None):
    if not isinstance(raw, dict):
        raise ValueError("Wort fehlt")
    word = dict(existing or {})
    for key, limit in WORD_LIMITS.items():
        if key in raw or existing is None:
            value = raw.get(key) or ""
            if not isinstance(value, str):
                raise ValueError(f"{key} muss Text sein")
            word[key] = value.strip()[:limit]
    if not word["de"] or not word["jp"]:
        raise ValueError("Deutsch und Japanisch sind Pflichtfelder")
    return word


class Handler(SimpleHTTPRequestHandler):
    server_version = "JapanischTrainer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "www"), **kwargs)

    # ---------- helpers ----------

    def allowed(self):
        if config["trusted"] and self.client_address[0] != config["trusted"]:
            self.send_error(HTTPStatus.FORBIDDEN)
            return False
        return True

    def send_json(self, value, status=HTTPStatus.OK):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def fail(self, message, status=HTTPStatus.BAD_REQUEST):
        self.send_json({"error": message}, status)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("Anfrage zu groß")
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw or b"null")

    def ha_user(self):
        user_id = self.headers.get("X-Remote-User-Id")
        if not user_id:
            return None
        name = self.headers.get("X-Remote-User-Display-Name") or self.headers.get("X-Remote-User-Name") or "Ich"
        # Home Assistant user ids are hex strings; keep the profile id file-name safe anyway.
        return {"id": "ha-" + re.sub(r"[^A-Za-z0-9_-]", "", user_id)[:60], "name": name[:60]}

    def end_headers(self):
        if not self.path.startswith("/api/"):
            # Pick up new versions of the app right after an update.
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/") or os.environ.get("VERBOSE"):
            super().log_message(fmt, *args)

    # ---------- routing ----------

    def do_GET(self):
        if not self.allowed():
            return
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return super().do_GET()
        self.handle_api("GET", path)

    def do_POST(self):
        if self.allowed():
            self.handle_api("POST", urlparse(self.path).path)

    def do_PUT(self):
        if self.allowed():
            self.handle_api("PUT", urlparse(self.path).path)

    def do_DELETE(self):
        if self.allowed():
            self.handle_api("DELETE", urlparse(self.path).path)

    def handle_api(self, method, path):
        parts = path.strip("/").split("/")[1:]  # drop "api"
        try:
            body = self.read_body() if method in ("POST", "PUT") else None
            with lock:
                self.route(method, parts, body)
        except json.JSONDecodeError:
            self.fail("Ungültige Daten")
        except ValueError as e:
            self.fail(str(e))

    def route(self, method, parts, body):
        if parts == ["state"] and method == "GET":
            return self.get_state()
        if parts == ["profiles"] and method == "POST":
            return self.create_profile(body)
        if len(parts) >= 2 and parts[0] == "profiles":
            pid = parts[1]
            if not ID_RE.match(pid):
                return self.fail("Ungültiges Profil", HTTPStatus.NOT_FOUND)
            if len(parts) == 2 and method == "DELETE":
                return self.delete_profile(pid)
            if parts[2:] == ["data"] and method == "GET":
                return self.send_json(read_json(data_path("users", pid + ".json"), {}))
            if parts[2:] == ["data"] and method == "PUT":
                if not isinstance(body, dict):
                    return self.fail("Daten fehlen")
                if not any(p["id"] == pid for p in load_shared()["profiles"]):
                    return self.fail("Unbekanntes Profil", HTTPStatus.NOT_FOUND)
                write_json(data_path("users", pid + ".json"), body)
                return self.send_json({"ok": True})
        if parts == ["words"] and method == "GET":
            return self.send_json({"words": load_shared()["words"]})
        if parts == ["words"] and method == "POST":
            return self.add_words(body)
        if len(parts) == 2 and parts[0] == "words" and method in ("PUT", "DELETE"):
            return self.change_word(method, parts[1], body)
        self.fail("Nicht gefunden", HTTPStatus.NOT_FOUND)

    # ---------- endpoints ----------

    def get_state(self):
        shared = load_shared()
        self.send_json({"me": self.ha_user(), "profiles": shared["profiles"], "words": shared["words"]})

    def create_profile(self, body):
        body = body if isinstance(body, dict) else {}
        shared = load_shared()
        me = self.ha_user()
        if body.get("ha"):
            # Profile linked to the logged-in Home Assistant user.
            if not me:
                return self.fail("Kein Home-Assistant-Benutzer angemeldet")
            profile = next((p for p in shared["profiles"] if p["id"] == me["id"]), None)
            if profile:
                return self.send_json({"profile": profile, "profiles": shared["profiles"]})
            profile = {"id": me["id"], "name": me["name"], "ha": True}
        else:
            name = body.get("name")
            if not isinstance(name, str) or not name.strip():
                return self.fail("Name fehlt")
            profile = {"id": uuid.uuid4().hex[:12], "name": name.strip()[:60]}
        profile["created"] = int(time.time() * 1000)
        shared["profiles"].append(profile)
        write_json(data_path("shared.json"), shared)
        self.send_json({"profile": profile, "profiles": shared["profiles"]})

    def delete_profile(self, pid):
        shared = load_shared()
        shared["profiles"] = [p for p in shared["profiles"] if p["id"] != pid]
        write_json(data_path("shared.json"), shared)
        try:
            os.remove(data_path("users", pid + ".json"))
        except FileNotFoundError:
            pass
        self.send_json({"profiles": shared["profiles"]})

    def add_words(self, body):
        items = (body or {}).get("words") if isinstance(body, dict) else None
        if not isinstance(items, list):
            return self.fail("Wörter fehlen")
        shared = load_shared()
        ids = {w["id"] for w in shared["words"]}
        added = []
        for raw in items:
            word = clean_word(raw)
            wid = raw.get("id")
            word["id"] = wid if isinstance(wid, str) and ID_RE.match(wid) and wid not in ids else uuid.uuid4().hex[:12]
            word["created"] = raw.get("created") if isinstance(raw.get("created"), int) else int(time.time() * 1000)
            by = raw.get("by")
            word["by"] = by.strip()[:60] if isinstance(by, str) else ""
            ids.add(word["id"])
            shared["words"].append(word)
            added.append(word["id"])
        write_json(data_path("shared.json"), shared)
        self.send_json({"words": shared["words"], "added": added})

    def change_word(self, method, wid, body):
        shared = load_shared()
        index = next((i for i, w in enumerate(shared["words"]) if w["id"] == wid), None)
        if index is None:
            return self.fail("Wort nicht gefunden – wurde es inzwischen gelöscht?", HTTPStatus.NOT_FOUND)
        if method == "DELETE":
            shared["words"].pop(index)
        else:
            shared["words"][index] = clean_word(body, shared["words"][index])
        write_json(data_path("shared.json"), shared)
        self.send_json({"words": shared["words"]})


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8099)))
    parser.add_argument("--data", default="data", help="directory for the JSON files")
    parser.add_argument("--trusted", help="only accept requests from this IP (the ingress proxy)")
    args = parser.parse_args()
    config["data"] = os.path.abspath(args.data)
    config["trusted"] = args.trusted
    os.makedirs(config["data"], exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"Japanisch Trainer on port {args.port}, data in {config['data']}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
