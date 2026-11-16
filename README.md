# 風流オンライン（和モダン・プロトタイプ）

Next.js (App Router) + TypeScript + Tailwind CSS による、連作の川柳／短歌ゲームです。

## モード

| モード | 形式 | 人数 |
|--------|------|------|
| 俳句 | 五・七・五 | 一〜三人 |
| 短歌 | 五・七・五・七・七 | 二〜五人 |
| リレーで風流 | ひらがな一音リレーで人数分の俳句 | 二〜六人 |

いまの画面は人間だけで進みます。選んだ人数分の句はあなたがすべて書きます。CPU の席埋めと自動入力は `src/cpu/match.ts` に退避してあり、画面からは呼んでいません。リレーで風流はひらがな（拗音可）、漢字一文字、または英字一文字を一音として回し、十七音×人数の俳句を作ります。

## オンライン（Supabase）

1. `.env.example` を参考に `.env.local` を作る
2. Supabase SQL Editor で [`supabase/schema.sql`](supabase/schema.sql) を実行する
3. Realtime が `rooms` / `room_players` に有効か確認する

部屋を作った人のルームコードを共有すると、別端末から入れます。

## 起動

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)
