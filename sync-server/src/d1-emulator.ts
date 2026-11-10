import Database from 'better-sqlite3';
import type { D1Database, D1PreparedStatement } from './app.js';

// 本地 Node 运行时的 D1 模拟器（Cloudflare 部署走真 D1，但本地 install.sh 会用这个）。
// 关键：batch 必须在 better-sqlite3 的同步事务内真正执行 SQL 并让异常抛出，
// 否则 DDL/写入失败会被未 await 的 Promise 吞掉、事务不回滚，上层误判成功。

// 把「同步执行本条语句」的闭包挂到 statement 上，供 batch 使用；
// 用 Symbol 避免污染 D1PreparedStatement 的公开字段。
const SYNC_RUN = Symbol('d1-sync-run');
type SyncRunnable = D1PreparedStatement & { [SYNC_RUN]?: () => unknown };

export class D1Emulator implements D1Database {
  private db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
  }

  prepare(query: string): D1PreparedStatement {
    const createBoundStatement = (boundValues: unknown[]): D1PreparedStatement => {
      const execSync = (): unknown => {
        const stmt = this.db.prepare(query);
        return stmt.run(...boundValues);
      };
      const statement: SyncRunnable = {
        bind: (...values: unknown[]) => createBoundStatement(values),
        first: async <T = Record<string, unknown>>() => {
          const stmt = this.db.prepare(query);
          const result = stmt.get(...boundValues) as T | undefined;
          return result ?? null;
        },
        all: async <T = Record<string, unknown>>() => {
          const stmt = this.db.prepare(query);
          const results = stmt.all(...boundValues) as T[];
          return { results };
        },
        run: async () => {
          execSync();
          return {};
        },
        [SYNC_RUN]: execSync,
      };
      return statement;
    };
    return createBoundStatement([]);
  }

  async batch(statements: D1PreparedStatement[]): Promise<unknown[]> {
    const results: unknown[] = [];
    // transaction 的回调必须同步：逐条同步执行，任一异常都会向上传播并回滚整批。
    const transaction = this.db.transaction(() => {
      for (const statement of statements) {
        const syncRun = (statement as SyncRunnable)[SYNC_RUN];
        if (syncRun) {
          syncRun();
        } else {
          // 兜底：非本模拟器产生的 statement，等待其异步结果（此时不在事务里执行）。
          void (statement as D1PreparedStatement).run();
        }
        results.push({});
      }
    });
    transaction();
    return results;
  }
}
