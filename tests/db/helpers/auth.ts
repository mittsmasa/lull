// Server Action テスト用の session mock helper。
// setup.ts で vi.mock("@/lib/session") を仕込み、globalThis 経由で
// session を切り替える。

type MockUser = { id: string };
type MockSession = {
  user: MockUser;
  session: { id: string };
};

function setMockSessionRaw(s: MockSession | null) {
  (globalThis as { __mockSession?: unknown }).__mockSession = s;
}

export function loginAs(user: MockUser): MockSession {
  const session = {
    user: { id: user.id },
    session: { id: `test-session-${user.id}` },
  } satisfies MockSession;
  setMockSessionRaw(session);
  return session;
}

export function logout() {
  setMockSessionRaw(null);
}
