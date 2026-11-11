/** 文字単位のLCS差分（日本語は単語区切りがないため文字単位）。長文は行単位にフォールバック。 */
export type DiffSeg = { op: "eq" | "add" | "del"; text: string };

function lcsDiff<T>(a: T[], b: T[]): { op: DiffSeg["op"]; item: T }[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { op: DiffSeg["op"]; item: T }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: "eq", item: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: "del", item: a[i] }); i++; }
    else { out.push({ op: "add", item: b[j] }); j++; }
  }
  while (i < n) out.push({ op: "del", item: a[i++] });
  while (j < m) out.push({ op: "add", item: b[j++] });
  return out;
}

export function diffText(before: string, after: string): DiffSeg[] {
  const useLines = before.length * after.length > 4_000_000;
  const a = useLines ? before.split(/(?<=\n)/) : [...before];
  const b = useLines ? after.split(/(?<=\n)/) : [...after];
  const raw = lcsDiff(a, b);
  const segs: DiffSeg[] = [];
  for (const r of raw) {
    const last = segs[segs.length - 1];
    if (last && last.op === r.op) last.text += r.item;
    else segs.push({ op: r.op, text: r.item });
  }
  return segs;
}
