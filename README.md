# 風流オンライン（和モダン・プロトタイプ）

Next.js (App Router) + TypeScript + Tailwind CSS による、連作の川柳／短歌ゲームです。

## モード

| モード | 形式 | 人数 |
|--------|------|------|
| 俳句 | 五・七・五 | 一〜三人 |
| 短歌 | 五・七・五・七・七 | 二〜五人 |
| リレーで風流 | お題のあと「しっかり／自由律」を選び、短冊を回して人数分の俳句 | 二〜六人 |

いまの画面は人間だけで進みます。選んだ人数分の句はあなたがすべて書きます。CPU の席埋めと自動入力は `src/cpu/match.ts` に退避してあり、画面からは呼んでいません。しっかり風流はひらがな（拗音可）・英字一文字（漢字不可、「っ」は単体のみ）で十七音。自由律風流は十七枠に好きな文字を詰め込みます。

## オンライン（Supabase）

1. `.env.example` を参考に `.env.local` を作る
2. Supabase SQL Editor で [`supabase/schema.sql`](supabase/schema.sql) を実行する
3. Realtime が `rooms` / `room_players` に有効か確認する

誰かが「みんなで詠む」や「リレーで風流」で部屋を作ると、別端末のホーム画面の「和室に参加する」に開いている和室が一覧で表示され、選ぶだけで入れます。

## 起動

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)
