import io
import unittest
import urllib.error
from diagnose_zerogpu_d11 import diagnose

class D11DiagnosticTests(unittest.TestCase):
    def test_missing_key_does_not_call_network(self):
        calls=[]
        result=diagnose("",opener=lambda *args,**kwargs:calls.append(1))
        self.assertEqual(result["status"],"NO_ENVIRONMENT_CREDENTIAL")
        self.assertEqual(result["requests"],0)
        self.assertEqual(calls,[])

    def test_x_api_key_contract_one_call(self):
        requests=[]
        class FakeResponse:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self,n): return b'{"answers":{}}'
        def opener(request,timeout):
            requests.append(request)
            self.assertEqual(timeout,12)
            return FakeResponse()
        result=diagnose("test-dummy-value",opener=opener)
        self.assertEqual(result["status"],"OK")
        self.assertEqual(result["requests"],1)
        self.assertEqual(result["http_status"],200)
        self.assertEqual(len(requests),1)
        self.assertEqual(requests[0].full_url,"https://api.zerogpu.ai/v1/systemone")
        self.assertEqual(requests[0].get_method(),"POST")
        self.assertEqual(requests[0].get_header("X-api-key"),"test-dummy-value")

    def test_403_rejection_is_sanitized(self):
        def opener(request,timeout):
            raise urllib.error.HTTPError(request.full_url,403,
                "Forbid with intentionally sensitive internal message",
                {"X-Request-ID":"diagnostic-test-id"},io.BytesIO(b"private provider body"))
        result=diagnose("test-dummy-value",opener=opener)
        self.assertEqual(result["status"],"HTTP_REJECTED")
        self.assertEqual(result["http_status"],403)
        self.assertEqual(result["requests"],1)
        self.assertNotIn("private",str(result))
        self.assertNotIn("test-dummy-value",str(result))

    def test_unknown_auth_mode_rejected_before_network(self):
        with self.assertRaises(ValueError):
            diagnose("test-dummy-value",auth="custom",opener=lambda *args,**kwargs:None)
if __name__=="__main__":unittest.main()
