"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

type HeaderConfig = {
  showBackButton: boolean;
};

type HeaderConfigContextValue = HeaderConfig & {
  setShowBackButton: (show: boolean) => void;
};

const HeaderConfigContext = createContext<HeaderConfigContextValue>({
  showBackButton: false,
  setShowBackButton: () => {},
});

export function HeaderConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showBackButton, setShowBackButton] = useState(false);

  return (
    <HeaderConfigContext.Provider value={{ showBackButton, setShowBackButton }}>
      {children}
    </HeaderConfigContext.Provider>
  );
}

export function useHeaderConfig() {
  return useContext(HeaderConfigContext);
}

/**
 * ページに配置してヘッダーの設定を宣言するコンポーネント。
 * Server Component のページ内に配置するだけでヘッダーの表示を制御できる。
 * 現在は `showBackButton` のみだが、将来の設定項目追加に対応可能。
 *
 * @example
 * <HeaderConfig showBackButton />
 */
export function HeaderConfig({
  showBackButton = false,
}: {
  showBackButton?: boolean;
}) {
  const { setShowBackButton } = useHeaderConfig();

  useLayoutEffect(() => {
    setShowBackButton(showBackButton);
    return () => setShowBackButton(false);
  }, [showBackButton, setShowBackButton]);

  return null;
}
