import os
def check():
    required_files = [
        "CLAUDE.md",
        "risk/risk_engine.py",
        "tests/run_tests.py"
    ]
    missing = []
    for f in required_files:
        if not os.path.exists(f):
            missing.append(f)
    if missing:
        print("❌ 缺少关键文件:")
        for m in missing:
            print("-", m)
        return False
    print("✅ 基础结构检查通过")
    return True
if __name__ == "__main__":
    check()
