import type { ShirazuStyle, VerseMode } from "@/types/game";

export const MODE_LABEL: Record<VerseMode, string> = {
  haiku: "俳句",
  tanka: "短歌",
  shirazu: "リレーで風流",
};

export const SHIRAZU_STYLE_LABEL: Record<ShirazuStyle, string> = {
  strict: "しっかり風流",
  free: "自由律風流",
};

export const MODE_PATTERN: Record<VerseMode, string> = {
  haiku: "五・七・五",
  tanka: "五・七・五・七・七",
  shirazu: "一音／拗音などで短冊を回す・人数分の俳句",
};

/** 表示用：リレーなら流派名、雲隠れなら「俳句・雲隠れ」 */
export function roomModeLabel(
  mode: VerseMode,
  shirazuStyle: ShirazuStyle = "strict",
  kumoGakure = false,
): string {
  if (mode === "shirazu") return SHIRAZU_STYLE_LABEL[shirazuStyle];
  if (kumoGakure && (mode === "haiku" || mode === "tanka")) {
    return `${MODE_LABEL[mode]}・雲隠れ`;
  }
  return MODE_LABEL[mode];
}

export const LINE_COUNT: Record<VerseMode, number> = {
  haiku: 3,
  tanka: 5,
  /** 一首あたりの行数（人数分の首を作る） */
  shirazu: 3,
};

/** 俳句・短歌はソロ可。リレーで風流は複数人専用 */
export const PLAYER_COUNT_RANGE: Record<
  VerseMode,
  { min: number; max: number }
> = {
  haiku: { min: 1, max: 3 },
  tanka: { min: 1, max: 5 },
  shirazu: { min: 2, max: 6 },
};

/** オンライン開宴に必要な最小人数 */
export const ONLINE_MIN_PLAYERS = 2;

export function modeAllowsSolo(mode: VerseMode): boolean {
  return PLAYER_COUNT_RANGE[mode].min === 1;
}

export const PART_LABELS: Record<VerseMode, string[]> = {
  haiku: ["上の句", "中の句", "下の句"],
  tanka: ["初句", "二句", "三句", "四句", "結句"],
  shirazu: ["上の句", "中の句", "下の句"],
};

/** 緩めの文字上限（リレーで風流は常に一文字） */
export const PART_LIMITS: Record<VerseMode, number[]> = {
  haiku: [10, 14, 10],
  tanka: [10, 12, 10, 12, 12],
  shirazu: [1, 1, 1],
};

/** 五・七・五（短歌は続く七・七）の目安 */
export const PART_TARGETS: Record<VerseMode, number[]> = {
  haiku: [5, 7, 5],
  tanka: [5, 7, 5, 7, 7],
  shirazu: [5, 7, 5],
};

/** 雲隠れで他人の句の代わりに出す。五は？5つ、七は？7つ */
export function hiddenPartMark(mode: VerseMode, index: number): string {
  const count = PART_TARGETS[mode]?.[index] ?? 5;
  return "？".repeat(count);
}

export const EMPTY_FALLBACK = "（無言）";

export const DEFAULT_NICKNAME = "名無しの俳人";

/** お題の最大文字数 */
export const THEME_MAX_LENGTH = 20;

/** ランダムお題の候補 */
export const THEME_PROMPTS: string[] = [
  "春の雨",
  "夏の夜",
  "秋の月",
  "冬の朝",
  "飛行機雲",
  "駅のホーム",
  "窓辺",
  "猫",
  "コーヒー",
  "帰り道",
  "風鈴",
  "夕焼け",
  "古本",
  "自転車",
  "海辺",
  "静けさ",
  "ありがとう",
  "忘れもの",
  "朝のトースト",
  "深夜の自動販売機",
  "洗い物",
  "傘を忘れた日",
  "耳鳴り",
  "二度寝",
  "冷蔵庫の奥",
  "コンビニの照明",
  "踏切の待ち時間",
  "髪を切ったあと",
  "靴下が片っぽ",
  "読みかけの本",
  "遠い雷",
  "窓ガラスの結露",
  "目覚ましを止める指",
  "乾いたタオル",
  "電車のつり革",
  "ポストの影",
  "雨上がりの匂い",
  "冷たい蛇口",
  "布団の端",
  "メモの裏",
  "信号待ち",
  "曇り空のまま",
  "夕方のチャイム",
  "机の落書き",
  "飲みかけの水",
  "鍵を探す夜",
  "夢の途中",
  "月曜の朝",
  "金曜の夕方",
  "未送信の文",
  "誤変換",
  "返信に困る",
  "スタンプだけ",
  "深夜のタイムライン",
  "通知オフ",
  "電池切れ直前",
  "下書き保存",
  "届かない手紙",
  "思い出せない顔",
  "説明できない夢",
  "昨日の自分へ",
  "未来の忘れ物",
  "透明な傘",
  "影が先に帰る",
  "足音が消える",
  "鏡の向こう",
  "名前のない星",
  "余韻だけ",
  "横顔の記憶",
  "後ろ姿だけ",
  "南向きの窓",
  "東の空",
  "西日が強い",
  "ぼんやりした月",
  "くっきりした影",
  "にじんだインク",
  "溶ける氷",
  "湯気の行方",
  "水面のゆらぎ",
  "波紋の中心",
  "石を投げたあと",
  "浮かぶ落ち葉",
  "折れた枝",
  "土の匂い",
  "雨上がりの土",
  "ぬかるみ",
  "足跡が残る",
  "坂の上の風",
  "急な階段",
  "ゆるい坂道",
  "近道が遠回り",
  "終電逃した顔",
  "始発待ちのベンチ",
  "乗り過ごし",
  "無人駅の灯",
  "終着駅の風",
  "線路脇の猫",
  "踏切の赤",
  "遮断機の影",
  "開かずの踏切",
  "隣が空いてる",
  "優先席の迷い",
  "つり革届かない",
  "スヌーズ十回",
  "寝坊の美学",
  "夜型の朝",
  "昼夜逆転",
  "部屋の中の旅",
  "窓から見る旅",
  "遅延証明書",
  "運休のお知らせ",
  "拾った鍵",
  "握りしめた切符",
  "あと少し",
  "あと一歩",
  "もやもや",
  "どきどき",
  "ぼんやり",
  "しーん",
  "ざわざわ",
  "うきうき",
  "一度きりの雨",
  "連休明け",
  "連休前夜",
  "午前零時",
  "止まった時計",
  "ずれた時計",
  "寄り道の価値",
  "遠回りが近道",
  "迷子になっていい",
  "行間を読む",
  "余白に書く",
  "三度目の正直",
  "今日限りの句",
  "なんとなく春",
  "だいたい秋",
  "たぶん猫",
  "忙しい暇",
  "真面目な冗談",
  "たぶん大丈夫",
  "後でやる",
  "やり直し",
  "はじめから",
  "消えた下書き",
  "履歴消した夜",
  "おやすみモード",
  "集中モード失敗",
  "ピンボケな日",
  "撮り直し",
  "ベストショットじゃない",
  "名前だけ残る",
  "声だけ残る",
  "匂いだけ残る",
  "感触だけ",
  "工事中につき",
  "準備中",
  "特になし",
  "未定",
  "保留",
];

export const PLAYER_COLORS = [
  "#111111",
  "#333333",
  "#555555",
  "#222222",
  "#444444",
  "#1a1a1a",
];
