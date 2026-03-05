// Storybook 用の better-sqlite3 モック
export default class Database {
  prepare() {
    return {
      run: () => ({}),
      get: () => undefined,
      all: () => [],
    };
  }
  exec() {}
  close() {}
}
