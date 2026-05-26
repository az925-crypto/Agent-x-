---
description: Deep review of all Instagram tools
---

Review semua Instagram tools:

Baca file:
- `tools/ig/main.py`
- `tools/ig/ig_followers.py`
- `tools/ig/ig_following.py`
- `tools/ig/ig_download.py`
- `tools/ig/ig_media.py`
- `tools/orchestrator.ts` (fungsi runIG*)

Cek:
1. Delay range (harus [3, 7]) dan request_timeout (30)
2. Session file: path konsisten? save/load setelah login?
3. Output JSON format konsisten antar script? (perhatikan camelCase vs snake_case)
4. Error handling: setiap NetworkError, RateLimit (429), LoginFail tertangkap?
5. Path di orchestrator.ts cocok dengan file aktual?
6. `safe_call` helper digunakan di ig_media.py dan ig_download.py — apakah cukup?
7. Python syntax valid (jalankan `python3 -m py_compile`)

JANGAN edit file apapun.
