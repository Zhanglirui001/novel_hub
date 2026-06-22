// 字符级 diff（代码改动风格的就地预览用）。
// 经典 LCS：选区通常几十~几百字，O(n*m) 完全够用；用 Array.from 切分以兼容中文与代理对。

export type DiffSegType = "equal" | "del" | "ins";

export interface DiffSeg {
  type: DiffSegType;
  text: string;
}

export function diffChars(a: string, b: string): DiffSeg[] {
  const A = Array.from(a);
  const B = Array.from(b);
  const n = A.length;
  const m = B.length;

  // dp[i][j] = A[i..] 与 B[j..] 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        A[i] === B[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      raw.push({ type: "equal", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "del", text: A[i] });
      i++;
    } else {
      raw.push({ type: "ins", text: B[j] });
      j++;
    }
  }
  while (i < n) {
    raw.push({ type: "del", text: A[i] });
    i++;
  }
  while (j < m) {
    raw.push({ type: "ins", text: B[j] });
    j++;
  }

  // 合并相邻同类型段
  const merged: DiffSeg[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else merged.push({ ...seg });
  }
  return merged;
}
