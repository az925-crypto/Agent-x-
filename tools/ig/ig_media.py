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
    r = {"success": ok, "tool": "ig_media"}
    if ok: r |= {"data": data, "meta": {"source": src, "duration_ms": round(ms)}}
    else: r |= {"error": err, "meta": {"source": src, "duration_ms": round(ms)}}
    print(json.dumps(r))

def safe_call(func, *args):
    try:
        return func(*args)
    except Exception as e:
        return None

def main():
    if len(sys.argv) < 2:
        out(False, err="Usage: ig_media.py <username> [amount=5]")
        return
    tgt = sys.argv[1].strip().lower()
    amount = int(sys.argv[2]) if len(sys.argv) > 2 else 5
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

    user_id = safe_call(cl.user_id_from_username, tgt)
    if not user_id:
        out(False, err=f"User {tgt} not found", ms=(time.monotonic()-t0)*1000)
        return

    medias = safe_call(cl.user_medias, user_id, amount)
    if not medias:
        out(False, err=f"Failed to fetch media / no media available", ms=(time.monotonic()-t0)*1000)
        return

    result = []
    for m in medias:
        item = {
            "id": m.pk,
            "code": m.code,
            "media_type": m.media_type,
            "caption": m.caption_text,
            "like_count": m.like_count,
            "comment_count": m.comment_count,
            "taken_at": str(m.taken_at),
        }

        comments = safe_call(cl.media_comments, m.pk, 20)
        if comments:
            item["comments"] = [
                {"username": c.user.username, "text": c.text, "pk": c.pk}
                for c in comments
            ]

        likers = safe_call(cl.media_likers, m.pk)
        if likers:
            item["likers"] = [u.username for u in likers]

        result.append(item)

    out(True, data={
        "target": tgt,
        "total_posts": len(result),
        "posts": result
    }, src="instagrapi", ms=(time.monotonic()-t0)*1000)

def _main():
    try:
        main()
        return True
    except SystemExit: raise
    except: return False

if __name__ == "__main__":
    sys.exit(0 if _main() else 1)
