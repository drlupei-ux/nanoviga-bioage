def evaluate_risk(text):
    score = 0
    # 医学真实性检测（简化规则）
    if "停药" in text:
        score += 3
    # 用药风险
    if "自行增加剂量" in text:
        score += 3
    # 表达风险
    if "必须" in text or "绝对" in text:
        score += 1
    # 推理缺失（极简模拟）
    if len(text) < 10:
        score += 1
    # 风险等级划分
    if score >= 6:
        level = "R3"
    elif score >= 4:
        level = "R2"
    elif score >= 2:
        level = "R1"
    else:
        level = "R0"
    return {
        "score": score,
        "level": level
    }
