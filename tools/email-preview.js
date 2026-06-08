// tools/email-preview.js — render sample L1 + CBA emails to HTML files for visual QA.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../cloud-functions/shared/emailTemplate');

const common = {
  agingPaceStr: '0.89x', peerRankStr: '前28%', contact: '见微信备注编号 BCA-9X2A',
  submittedAt: '2026-06-08 10:00', date: '2026-06-08',
};

const l1 = T.assembleL1Sections(
  { ...common, name: '张三', age: 45, gender: 'male', bioAge: 40, score: 75, assessmentCode: 'BCA-9X2A' },
  {
    rating: '优秀',
    risks: [
      { name: '营养代谢失衡（核心风险）', oneLine: '营养代谢维度偏弱，糖化与胰岛素抵抗风险上升。' },
      { name: '睡眠与压力恢复不足', oneLine: '皮质醇偏高，抑制修复、加剧内脏脂肪堆积。' },
      { name: '有氧—力量结构失衡', oneLine: '缺乏抗阻训练，肌肉量与代谢储备下降。' },
    ],
    mechanism: [{ cause: '久坐 + 精制碳水', physiology: '胰岛素抵抗 → 慢性低度炎症', result: '加速细胞与血管衰老' }],
    roadmap: {
      d7: ['每天快走6000步', '晚餐减少精制主食', '23:00 前入睡'],
      d30: ['每周2次抗阻训练', '复查 hsCRP 与空腹胰岛素'],
      d90: ['体脂率下降3%', '腰围下降3cm'],
    },
  },
  '',
);

const cba = T.assembleCbaSections(
  {
    ...common, name: '李四', age: 50, gender: 'female', bioAge: 47, score: 68,
    assessmentCode: 'CBA-7K2', agingPaceStr: '0.94x', peerRankStr: '前41%',
  },
  {
    rating: '需关注',
    risks: [
      { name: '炎症免疫器官年龄偏高', oneLine: 'hsCRP 与淋巴细胞比例提示低度炎症。' },
      { name: '代谢活力下降', oneLine: '空腹血糖与白蛋白提示代谢储备减弱。' },
      { name: '肾代谢负荷上升', oneLine: '肌酐偏高，需关注水化与蛋白摄入结构。' },
    ],
    mechanism: [{ cause: '慢性炎症', physiology: 'IL-6/CRP 通路持续激活', result: '多器官加速老化' }],
    roadmap: {
      d7: ['增加深色蔬菜与 Omega-3'],
      d30: ['复查炎症四项'],
      d90: ['炎症标志物回落至参考区间'],
    },
  },
  '',
);

const dir = path.join(__dirname, 'preview');
fs.mkdirSync(dir, { recursive: true });

const l1Path = path.join(dir, 'L1.html');
const cbaPath = path.join(dir, 'CBA.html');

fs.writeFileSync(l1Path, T.renderEmail(l1));
fs.writeFileSync(cbaPath, T.renderEmail(cba));

console.log('Wrote', l1Path, 'and CBA.html');
