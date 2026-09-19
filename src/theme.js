// DESIGN.md（Claude warm-canvas editorial）に基づくデザイントークン。
// App.jsx はここだけを参照し、hex を直接書かない。

export const C = {
  primary: '#cc785c', // コーラル。主要ボタン背景・ブランドアクセント
  primaryActive: '#a9583e', // コーラル押下時
  primaryDisabled: '#e6dfd8', // コーラル系ボタンの無効状態背景
  ink: '#141413', // 見出し・主要テキスト
  bodyStrong: '#252523', // 強調段落
  body: '#3d3d3a', // 本文テキスト
  muted: '#6c6a64', // 補助見出し・パンくず
  mutedSoft: '#8e8b82', // 注記・キャプション
  hairline: '#e6dfd8', // クリーム面の1px罫線
  hairlineSoft: '#ebe6df', // ごく薄い区切り線（テーブル行など）
  canvas: '#faf9f5', // カード・入力欄の下地（最も明るいクリーム）
  surfaceSoft: '#f5f0e8', // ページの床・カード内インセット行
  surfaceCard: '#efe9de', // 選択中/強調（アクティブタブ・選択済みチップ）
  surfaceCreamStrong: '#e8e0d2', // 最も強いクリーム（強調帯など）
  surfaceDark: '#181715', // ダーク帯（ヘッダー・Excel CTA のみ使用）
  surfaceDarkElevated: '#252320', // ダーク帯内の浮いたボタン等
  onPrimary: '#ffffff', // コーラル背景上の文字
  onDark: '#faf9f5', // ダーク面上の主要文字
  onDarkSoft: '#a09d96', // ダーク面上の補助文字
  teal: '#5db8a6', // アクセント（情報・修正案・土曜など）
  amber: '#e8a55a', // アクセント（学年色・警告寄りの補助色）
  success: '#5db872', // 成功・提出済みの状態ドット
  warning: '#d4a017', // 警告テキスト
  error: '#c64545', // エラー・未提出・削除
};

export const FONT = {
  display: "'Cormorant Garamond', 'Noto Serif JP', 'Times New Roman', serif",
  sans: "Inter, 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
};

export const R = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 9999 };
export const S = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 };

// タイポグラフィ。React のインラインスタイルにスプレッドして使う。
export const T = {
  pageTitle: {
    fontFamily: FONT.display,
    fontVariantNumeric: 'lining-nums',
    fontSize: 30,
    fontWeight: 500,
    letterSpacing: '-0.5px',
    lineHeight: 1.15,
  },
  sectionTitle: {
    fontFamily: FONT.display,
    fontVariantNumeric: 'lining-nums',
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: '-0.4px',
    lineHeight: 1.2,
  },
  cardTitle: {
    fontFamily: FONT.sans,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: 1.4,
  },
  body: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.55,
  },
  caption: {
    fontFamily: FONT.sans,
    fontSize: 12.5,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.45,
  },
  badge: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1.4,
  },
  button: {
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1,
  },
  mono: {
    fontFamily: FONT.mono,
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.5,
  },
};
