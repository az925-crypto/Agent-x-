#!/usr/bin/env python3
import json, os, sys, time, logging
logging.getLogger("instagrapi").setLevel(logging.CRITICAL)
from pathlib import Path

import tempfile as _tempfile
SESSION = Path(_tempfile.gettempdir()) / ".agent-x-ig-session.json"
IG_USER = os.environ.get("IG_USERNAME", "")
IG_PASS = os.environ.get("IG_PASSWORD", "")
IG_SID = os.environ.get("IG_SESSIONID", "")
DL_DIR = Path(__file__).parent / "downloads"

def out(ok, data=None, err="", src="", ms=0):
    r = {"success": ok, "tool": "ig_download"}
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
        out(False, err="Usage: ig_download.py <username> [amount=5]")
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

    DL_DIR.mkdir(parents=True, exist_ok=True)
    result = []

    for m in medias:
        item = {
            "id": m.pk,
            "code": m.code,
            "media_type": m.media_type,
            "caption": m.caption_text[:100] if m.caption_text else "",
            "taken_at": str(m.taken_at),
        }

        try:
            if m.media_type == 1:
                path = cl.photo_download(m.pk, str(DL_DIR))
            elif m.media_type == 2:
                path = cl.video_download(m.pk, str(DL_DIR))
            elif m.media_type == 8:
                paths = cl.album_download(m.pk, str(DL_DIR))
                item["download_paths"] = [str(p) for p in (paths if isinstance(paths, list) else [paths])]
                result.append(item)
                continue
            else:
                item["download_path"] = None
                result.append(item)
                continue

            item["download_path"] = str(path)
        except Exception as e:
            item["download_error"] = str(e)

        result.append(item)

    out(True, data={
        "target": tgt,
        "download_dir": str(DL_DIR),
        "total_downloaded": len([p for p in result if p.get("download_path") or p.get("download_paths")]),
        "items": result
    }, src="instagrapi", ms=(time.monotonic()-t0)*1000)

def _main():
    try:
        main()
        return True
    except SystemExit: raise
    except: return False

if __name__ == "__main__":
    sys.exit(0 if _main() else 1)
