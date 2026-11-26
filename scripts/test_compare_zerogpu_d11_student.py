import unittest
from compare_zerogpu_d11_student import cases, oracle, parse_answer, evaluate, OPTIONS
from compact_student_runtime import load_artifact
from pathlib import Path

ARTIFACT=Path(__file__).resolve().parents[1]/"examples/intelligence/synthetic-student-v1.json"
class D11ComparisonTest(unittest.TestCase):
    def test_oracle_and_fixed_scenarios(self):
        examples=cases()
        self.assertEqual(len(examples),12)
        self.assertEqual(oracle(examples[0]),"inspect")
        self.assertEqual(oracle(examples[1]),"return")
        self.assertEqual(oracle(examples[3]),"hold")
        self.assertEqual(oracle(examples[5]),"no_decision")
    def test_valid_d11_choice(self):
        probs={name:(1.0 if name=="hold" else 0.0) for name in OPTIONS}
        self.assertEqual(parse_answer({"answers":{"mission_choice":{
            "type":"choice","choice":"hold","confidence":1.0,"probabilities":probs
        }}}),( "hold",1.0))
    def test_invalid_choice_rejected(self):
        with self.assertRaises(ValueError):
            parse_answer({"answers":{"mission_choice":{
                "type":"choice","choice":"invented","confidence":1,
                "probabilities":{"inspect":1}
            }}})
    def test_transport_stub_proves_evaluation_pipeline(self):
        model=load_artifact(ARTIFACT)
        called=0
        def transport(state,key,timeout):
            nonlocal called
            called+=1
            return oracle(state),.95,12.3
        result=evaluate(model,"test-placeholder",limit=6,transport=transport)
        self.assertEqual(called,6)
        self.assertEqual(result["completed"],6)
        self.assertEqual(result["d11_matches_toy_teacher"],6)
        self.assertTrue(result["live"])  # Stubbed transport, not external validation.
    def test_fail_fast_on_remote_error(self):
        model=load_artifact(ARTIFACT)
        called=0
        def transport(*_):
            nonlocal called
            called+=1
            raise RuntimeError("ZEROGPU_HTTP_403")
        result=evaluate(model,"test-placeholder",limit=8,transport=transport)
        self.assertEqual(called,1)
        self.assertEqual(result["completed"],0)
        self.assertEqual(result["cases"][0]["error"],"ZEROGPU_HTTP_403")
if __name__=="__main__":unittest.main()
