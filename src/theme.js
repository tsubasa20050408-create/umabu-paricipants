// デザイントークン。VoltAgent/awesome-design-md の Apple DESIGN.md をもとにしている
// （ロゴや社名は使わず、配色・文字・角丸・余白の考え方だけを取り入れる）。
// App.jsx はここだけを参照し、hex を直接書かない。

export const C = {
  primary: '#0066cc', // アクションブルー。操作できる要素の唯一のアクセント
  primaryActive: '#0071e3', // フォーカス時の明るい青
  primaryOnDark: '#2997ff', // 黒い面の上で使う青
  primaryDisabled: '#e8e8ed', // 青ボタンの無効状態背景
  ink: '#1d1d1f', // 見出し・本文（黒に近いグレー。純黒は使わない）
  bodyStrong: '#1d1d1f', // 強調段落
  body: '#1d1d1f', // 本文テキスト
  muted: '#6e6e73', // 補助テキスト
  mutedSoft: '#86868b', // 注記・キャプション
  hairline: '#d2d2d7', // 1px の罫線（カード・入力欄）
  hairlineSoft: '#e8e8ed', // ごく薄い区切り線（テーブル行など）
  canvas: '#ffffff', // カード・入力欄の下地
  surfaceSoft: '#f5f5f7', // ページの床（パーチメント）・カード内インセット行
  surfaceCard: '#e8e8ed', // 選択中/強調（選択済みチップ）
  surfaceStrong: '#d2d2d7', // 最も強いグレー（強調帯など）
  surfaceDark: '#000000', // 黒い帯（ヘッダー）
  surfaceTile: '#1d1d1f', // 黒に近いタイル（Excel 出力の CTA 帯）
  surfaceDarkElevated: '#333336', // 黒い帯の上の浮いたボタン等
  onPrimary: '#ffffff', // 青背景上の文字
  onDark: '#f5f5f7', // 黒い面上の主要文字
  onDarkSoft: '#a1a1a6', // 黒い面上の補助文字
  teal: '#0071a4', // 情報（修正案・土曜など）
  success: '#248a3d', // 成功・提出済みの状態ドット
  warning: '#b25000', // 警告テキスト
  error: '#d70015', // エラー・未提出・削除・日曜
};

// SF Pro が使える Apple 端末ではそれを、それ以外は Inter + Noto Sans JP を使う
export const FONT = {
  display: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
  mono: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
};

// 角丸: 小さい操作 8 / 入力欄 11 / カード 18 / 主要ボタン・チップはピル
export const R = { xs: 5, sm: 8, md: 11, lg: 18, xl: 24, pill: 9999 };
export const S = { xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48 };

// タイポグラフィ。React のインラインスタイルにスプレッドして使う。
// 見出しは 600 で字間を詰める（500 は使わない: 300 / 400 / 600 / 700 の4段）
export const T = {
  pageTitle: {
    fontFamily: FONT.display,
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: '-0.4px',
    lineHeight: 1.14,
  },
  sectionTitle: {
    fontFamily: FONT.display,
    fontSize: 21,
    fontWeight: 600,
    letterSpacing: '-0.2px',
    lineHeight: 1.19,
  },
  cardTitle: {
    fontFamily: FONT.display,
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: '-0.3px',
    lineHeight: 1.25,
  },
  body: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: '-0.2px',
    lineHeight: 1.47,
  },
  caption: {
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: '-0.1px',
    lineHeight: 1.43,
  },
  badge: {
    fontFamily: FONT.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '-0.1px',
    lineHeight: 1.33,
  },
  button: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: '-0.2px',
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
