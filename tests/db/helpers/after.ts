/**
 * setup.ts の `next/server` モックが積んだ `after()` コールバックの完了を待つ。
 *
 * `after()` はレスポンス後に走る fire-and-forget のため、そのままでは
 * 「送信されたか」をテストから決定的に観測できない。時間待ち（setTimeout）に
 * 頼ると DB 直列実行の遅延で不安定になるので、Promise の完了そのものを待つ。
 *
 * コールバックの中でさらに `after()` が呼ばれるケースに備えて、
 * キューが空になるまで繰り返す
 */
export async function flushAfter(): Promise<void> {
  const g = globalThis as { __afterTasks?: Promise<unknown>[] };
  while (g.__afterTasks && g.__afterTasks.length > 0) {
    await Promise.all(g.__afterTasks.splice(0));
  }
}

/** 直前のテストが積み残した `after()` タスクを捨てる（検証前の地ならし用） */
export function clearAfterTasks(): void {
  const g = globalThis as { __afterTasks?: Promise<unknown>[] };
  g.__afterTasks?.splice(0);
}
