import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });

function copyTree(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dstName = entry.isFile() && entry.name.endsWith('.ts')
      ? `${entry.name.slice(0, -3)}.js`
      : entry.name;
    const dst = path.join(dstDir, dstName);
    if (entry.isDirectory()) {
      copyTree(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

copyTree(path.join(root, 'src'), path.join(dist, 'src'));
copyTree(path.join(root, 'test'), path.join(dist, 'test'));
