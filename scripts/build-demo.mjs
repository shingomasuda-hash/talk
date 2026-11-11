// 公開デモ（ブラウザだけで動く1ファイルのHTML）を dist/script-ai-demo.html に作る。
// 実行: npm run build:demo
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stub = path.join(root, "src/browser/node-stub.ts");

// サーバー専用の node:fs / node:path はブラウザでは使わない（Store をファイル無しで使う）ため空のスタブにする
const nodeStub = {
  name: "node-stub",
  setup(b) {
    b.onResolve({ filter: /^node:(fs|path)$/ }, () => ({ path: stub }));
  },
};

const result = await build({
  entryPoints: [path.join(root, "src/browser/demo.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
  plugins: [nodeStub],
  logLevel: "warning",
});
const bundle = result.outputFiles[0].text;

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/style.css"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script src="app\.js"><\/script>/, "").trim();

const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
const out = `<title>スクリプト簡単作成AI</title>
<meta name="description" content="最新版コールフロー（①キーマン名なし／②キーマン名あり）に基づく営業スクリプト作成・修正の公開デモ">
<style>
${css}
</style>
${body}
<script>
${safe(bundle)}
</script>
<script>
${safe(app)}
</script>
`;
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/script-ai-demo.html"), out);
console.log(`dist/script-ai-demo.html を作成しました（${(out.length / 1024).toFixed(0)} KB）`);
