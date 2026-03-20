import { setTimeout } from "node:timers/promises";

import type * as playwright from "playwright";
import type * as puppeteer from "puppeteer";
import { ResourceWatcher } from "storycrawler";

type Params = {
  playwrightPage: playwright.Page;
  puppeteerPage: puppeteer.Page;
  timeout?: number;
  url: string;
  /**
   * `networkidle` は WebSocket の常時接続で待機条件を満たせずタイムアウトしやすい。
   * ページ種類（例: DM）に応じて適宜変更する。
   */
  waitUntil?: "networkidle" | "load" | "domcontentloaded";
  /**
   * WebSocket/SSE などで「完了しない通信」があると、全リクエスト完了待ちが終わらない。
   * DM のページ計測では無効化する。
   */
  waitForRequestsComplete?: boolean;
};

export async function goTo({
  playwrightPage,
  puppeteerPage,
  timeout,
  url,
  waitUntil = "networkidle",
  waitForRequestsComplete = true,
}: Params) {
  // @ts-expect-error
  const watcher = new ResourceWatcher(puppeteerPage).init();

  await Promise.race([
    playwrightPage
      .goto(url, { waitUntil })
      .catch(() => {})
      .then(() => {
        // `/api/v1/me` APIはエラーを返す可能性があるので無視する
        const ignoredUrls = watcher.getRequestedUrls().filter((url) => url.includes("/api/v1/me"));
        for (const url of ignoredUrls) {
          (watcher["resolvedAssetsMap"] as Map<unknown, unknown>).delete(url);
        }
      })
      .then(() => (waitForRequestsComplete ? watcher.waitForRequestsComplete() : undefined)),
    setTimeout(timeout).then(() => {
      throw new Error("ページの読み込みがタイムアウトしました");
    }),
  ]);

  watcher.clear();
}
