// ----- ブランド型 -----

/**
 * Storage キーのブランド型
 * plain string を直接渡せないようにし、キーファクトリ関数の使用を強制する
 * T は値の型を表す（フックの戻り値に反映される）
 */
export type StorageKey<T> = string & {
  readonly __brand: "StorageKey";
  readonly __value: T;
};

// ----- sessionStorage キーファクトリ -----

/** sessionStorage のキーファクトリ。新しいキーはここに追加する */
export const sessionStorageKeys = {
  /** /join/[token] で OAuth 前に保存する表示名 */
  joinDisplayName: (token: string): StorageKey<string> =>
    `join:${token}:displayName` as StorageKey<string>,
  /** /join/[token] で OAuth 開始時に立てる「戻ったら自動参加」フラグ */
  joinPending: (token: string): StorageKey<string> =>
    `join:${token}:pending` as StorageKey<string>,
} as const;
