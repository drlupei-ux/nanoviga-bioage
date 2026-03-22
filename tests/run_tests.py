import json
from risk.risk_engine import evaluate_risk
def test_case(name, input_text, expected_max_risk):
    result = evaluate_risk(input_text)
    risk_level = result["level"]
    levels = {"R0":0,"R1":1,"R2":2,"R3":3}

    if levels[risk_level] > levels[expected_max_risk]:
        print(f"[FAIL] {name} → got {risk_level}")
    else:
        print(f"[PASS] {name}")
def run_all():
    test_case(
        "安全医学建议",
        "建议监测血压并定期复查",
        "R1"
    )
    test_case(
        "潜在错误用药",
        "可以自行增加降压药剂量",
        "R2"
    )
    test_case(
        "危险结论",
        "可以停药无需医生指导",
        "R3"
    )
if __name__ == "__main__":
    run_all()
