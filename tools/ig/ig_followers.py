#!/usr/bin/env python3
import json, os, sys, time, logging
logging.getLogger("instagrapi").setLevel(logging.CRITICAL)
from pathlib import Path

import tempfile as _tempfile
SESSION = Path(_tempfile.gettempdir()) / ".agent-x-ig-session.json"
IG_USER = os.environ.get("IG_USERNAME", "")
IG_PASS = os.environ.get("IG_PASSWORD", "")
IG_SID = os.environ.get("IG_SESSIONID", "")

def out(ok, data=None, err="", src="", ms=0):
    r = {"success": ok, "tool": "ig_followers"}
    if ok: r |= {"data": data, "meta": {"source": src, "duration_ms": round(ms)}}
    else: r |= {"error": err, "meta": {"source": src, "duration_ms": round(ms)}}
    print(json.dumps(r))

def main():
    if len(sys.argv) < 2:
        out(False, err="Usage: ig_followers.py <username>")
        return
    tgt = sys.argv[1].strip().lower()
    t0 = time.monotonic()

    try:
        from instagrapi import Client
    except ImportError:
        out(False, err="instagrapi not installed. pip install instagrapi", ms=(time.monotonic()-t0)*1000)
        return

    cl = Client()
    cl.delay_range = [3, 7]
    cl.request_timeout = 30
    if SESSION.exists():
        try: cl.load_settings(str(SESSION))
        except: pass
    try:
        if IG_SID: cl.login_by_sessionid(IG_SID)
        elif IG_USER and IG_PASS: cl.login(IG_USER, IG_PASS); cl.dump_settings(str(SESSION))
        else: out(False, err="IG_USERNAME/PASSWORD or IG_SESSIONID required", ms=(time.monotonic()-t0)*1000); return
    except Exception as e:
        out(False, err=f"Login failed: {e}", ms=(time.monotonic()-t0)*1000); return

    try:
        user_id = cl.user_id_from_username(tgt)
    except Exception as e:
        out(False, err=f"User {tgt} not found: {e}", ms=(time.monotonic()-t0)*1000)
        return
    try:
        followers = cl.user_followers(user_id, amount=100)
    except Exception as e:
        out(False, err=f"Failed to fetch followers: {e}", ms=(time.monotonic()-t0)*1000)
        return

    out(True, data={
        "target": tgt,
        "total_followers": len(followers),
        "followers": [
            {"username": u.username, "pk": u.pk, "full_name": u.full_name, "is_private": u.is_private}
            for u in followers.values()
        ]
    }, src="instagrapi", ms=(time.monotonic()-t0)*1000)

def _main():
    try:
        main()
        return True
    except SystemExit: raise
    except: return False

if __name__ == "__main__":
    sys.exit(0 if _main() else 1)
