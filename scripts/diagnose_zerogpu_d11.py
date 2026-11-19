#!/usr/bin/env python3
"""Single bounded ZeroGPU d1.1 access diagnostic with redacted errors.

Uses an already provisioned environment credential only.
Prints neither credential, request headers, prompts nor provider message text.
No retry and no fallback to a different endpoint.
"""
import json
import os
import urllib.request
import urllib.error
import sys

def diagnose(key, auth="x-api-key", opener=urllib.request.urlopen):
    if not key:
        return {"status":"NO_ENVIRONMENT_CREDENTIAL","requests":0}
    if auth not in ("x-api-key","bearer"):
        raise ValueError("unsupported authentication mechanism")
    headers={"Content-Type":"application/json","Accept":"application/json"}
    if auth=="x-api-key":
        headers["x-api-key"]=key
    else:
        headers["Authorization"]="Bearer "+key
    project=os.environ.get("ZGPU_PROJECT_ID") or os.environ.get("ZEROGPU_PROJECT_ID")
    if project:
        headers["x-project-id"]=project
    payload={"model":"d1.1","state":{"test":"synthetic classification, no physical effect"},
             "questions":{"action":{"type":"choice","criteria":{"a":"Inspect","b":"Hold"}}}}
    req=urllib.request.Request("https://api.zerogpu.ai/v1/systemone",
        data=json.dumps(payload).encode(),headers=headers,method="POST")
    try:
        with opener(req,timeout=12) as response:
            response.read(100_000)
            return {"status":"OK","http_status":response.status,"requests":1,
                    "auth":auth}
    except urllib.error.HTTPError as e:
        request_id=e.headers.get("x-request-id") or e.headers.get("X-Request-ID")
        # Deliberately discard provider error body; its text may contain request data.
        e.close()
        return {"status":"HTTP_REJECTED","http_status":e.code,"requests":1,
                "auth":auth,"request_id":request_id}
    except (urllib.error.URLError,TimeoutError):
        return {"status":"NETWORK_ERROR","requests":1,"auth":auth}

if __name__=="__main__":
    mode=(sys.argv[1] if len(sys.argv)>1 else "x-api-key")
    key=os.environ.get("ZGPU_API_KEY") or os.environ.get("ZEROGPU_API_KEY") or ""
    result=diagnose(key,mode)
    print(json.dumps(result,sort_keys=True))
    raise SystemExit(0 if result["status"]=="OK" else 2)
