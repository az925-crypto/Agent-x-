#!/usr/bin/env python3
import json, os, sys, time
from pathlib import Path

import tempfile as _tempfile
SESSION = Path(_tempfile.gettempdir()) / ".agent-x-ig-session.json"
IG_USER = os.environ.get("IG_USERNAME", "")
IG_PASS = os.environ.get("IG_PASSWORD", "")
IG_SID = os.environ.get("IG_SESSIONID", "")

def out(ok, data=None, err="", src="", ms=0):
    r = {"success": ok, "tool": "ig"}
    if ok: r |= {"data": data, "meta": {"source": src, "duration_ms": round(ms)}}
    else: r |= {"error": err, "meta": {"source": src, "duration_ms": round(ms)}}
    print(json.dumps(r))

def ents(users):
    return [{"username": u.username, "fullName": u.full_name,
             "isPrivate": u.is_private, "isVerified": u.is_verified}
            for u in (users or {}).values()]

def main():
    if len(sys.argv) < 2: out(False, err="Usage: main.py <username>"); return
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
        user = cl.user_info_by_username(tgt)
    except Exception as e:
        out(False, err=f"User {tgt} not found: {e}", ms=(time.monotonic()-t0)*1000)
        return

    p = {
        "username": user.username, "fullName": user.full_name,
        "biography": user.biography or "", "isPrivate": user.is_private,
        "isVerified": user.is_verified, "followerCount": user.follower_count,
        "followingCount": user.following_count, "mediaCount": user.media_count,
        "profilePicUrl": str(user.profile_pic_url or ""),
        "externalUrl": user.external_url, "publicEmail": getattr(user, "public_email", None),
        "contactPhoneNumber": getattr(user, "contact_phone_number", None),
        "isBusiness": user.is_business,
    }

    fl, fg = [], []
    try: fg = ents(cl.user_following(user.pk, amount=100))
    except: pass
    try: fl = ents(cl.user_followers(user.pk, amount=100))
    except: pass

    out(True, data={"profile": p, "followingList": fg, "followerList": fl},
        src="instagrapi", ms=(time.monotonic()-t0)*1000)

def _main():
    try:
        main()
        return True
    except SystemExit: raise
    except: return False

if __name__ == "__main__":
    sys.exit(0 if _main() else 1)
