/**
 * Deploy ONE CloudBase function's code from a pre-built inlined artifact.
 * Updates CODE ONLY — env vars, handler, triggers, memory, timeout are preserved.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/deploy-fn.ts <funcName> <artifactPath>
 * Example:
 *   ... scripts/deploy-fn.ts generateReport tools/deploy/generateReport.deploy.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import CloudBase from '@cloudbase/manager-node';

const name = process.argv[2];
const artifact = process.argv[3];
if (!name || !artifact) { console.error('usage: deploy-fn <funcName> <artifactPath>'); process.exit(1); }

const mgr = new (CloudBase as any)({
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
  envId: process.env.TCB_ENV_ID,
  region: 'ap-shanghai',
});

async function main() {
  const code = fs.readFileSync(artifact, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-deploy-'));
  // SDK expects functionRootPath/<funcName>/{index.js,package.json}
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, 'index.js'), code);
  // The function requires @cloudbase/node-sdk at runtime; declare it so CloudBase
  // installs it during deploy (InstallDependency=TRUE). Pinned to a verified 3.x.
  fs.writeFileSync(path.join(dir, name, 'package.json'), JSON.stringify({
    name, version: '1.0.0', dependencies: { '@cloudbase/node-sdk': '3.18.1' },
  }, null, 2));

  const before = await mgr.functions.getFunctionDetail(name);
  console.log(`deploying ${name}  (${Buffer.byteLength(code)} bytes)`);
  console.log(`  live ModTime before: ${before.ModTime} | handler: ${before.Handler}`);

  await mgr.functions.updateFunctionCode({
    func: { name, handler: 'index.main', runtime: 'Nodejs18.15', installDependency: true },
    functionRootPath: dir,
  });
  console.log('  updateFunctionCode submitted; polling status…');

  for (let i = 0; i < 30; i++) {
    const d = await mgr.functions.getFunctionDetail(name);
    if (d.Status === 'Active' && d.ModTime !== before.ModTime) {
      console.log(`✅ deployed. Status: Active | new ModTime: ${d.ModTime}`);
      return;
    }
    console.log(`  status: ${d.Status} (ModTime ${d.ModTime})…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('⚠️ did not confirm Active+new-ModTime within timeout — check the console.');
}
main().then(() => process.exit(0)).catch((e) => { console.error('❌ DEPLOY FAILED:', e?.message || e); process.exit(1); });
