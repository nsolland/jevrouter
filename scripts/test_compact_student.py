import tempfile
import json
import unittest
from pathlib import Path
from hashlib import sha256
from compact_student_runtime import choose, load_artifact

def sample():
    return {"battery":0.7,"obstacle_m":12,"wind_mps":4,"link":0.9,"sensor":0.95}
def artifact():
    return {"schema":"intelligence.compact-student.v1","features":["battery","obstacle_m","wind_mps","link","sensor"],
      "actions":["inspect","hold","return"],"layers":[
       {"w":[[0]*5 for _ in range(16)],"b":[0]*16},
       {"w":[[0]*16 for _ in range(3)],"b":[8,0,-8]}
      ],"training_source":"unit_test","model_architecture":"5-16-relu-3"}
class CompactStudentTest(unittest.TestCase):
    def test_choice_and_sensor_abstain(self):
        a=artifact()
        self.assertEqual(choose(a,sample())["action"],"inspect")
        self.assertEqual(choose(a,{**sample(),"sensor":0.2})["status"],"no_decision")
        self.assertEqual(choose(a,{**sample(),"battery":float("nan")})["status"],"no_decision")
        self.assertEqual(choose(a,{**sample(),"obstacle_m":999})["status"],"no_decision")
        self.assertEqual(choose(a,{"battery":0.8})["status"],"no_decision")
    def test_digest_and_dimension_validation(self):
        a=artifact()
        a["sha256"]=sha256(json.dumps(a,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/"artifact.json"
            p.write_text(json.dumps(a))
            self.assertEqual(load_artifact(p)["sha256"],a["sha256"])
            a["layers"][0]["w"][0]=[0]*4
            p.write_text(json.dumps(a))
            with self.assertRaises(ValueError):load_artifact(p)
            a=artifact()
            a["sha256"]="invalid"
            p.write_text(json.dumps(a))
            with self.assertRaises(ValueError):load_artifact(p)
if __name__=="__main__":unittest.main()
