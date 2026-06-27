# 歌詞和訳 下書き作成ローカルアプリ

## 起動

```sh
npm start
```

起動後、ブラウザで `http://127.0.0.1:4173` を開きます。

## OpenAI APIキー

`.env` を作成して `OPENAI_API_KEY=...` を書きます。

モデルは安価優先で `gpt-5.4-nano` を使います。変更したい場合だけ `.env` の `OPENAI_MODEL` を編集します。

## 広告位置

歌詞欄の中で広告を入れたい位置に、単独行で `[AD]` と入力します。

## 翻訳対象の最適化

- 空行は翻訳しません
- `[Verse 1]`、`[Chorus]`、`[Bridge]` などのセクション見出しは翻訳しません
- 同じ歌詞行はAIに1回だけ送り、2回目以降は翻訳結果を再利用します
- 重複判定では、前後空白、連続空白、全角スペースだけを軽く整えます

## 出力

生成結果の「記事タイトル」と「本文HTML」をWordPressへコピーして使います。

## Vercelで共有URLにする

GitHubにこのリポジトリを置き、VercelでImportします。

VercelのEnvironment Variablesには以下を設定します。

- `OPENAI_API_KEY`: OpenAI APIキー
- `OPENAI_MODEL`: 通常は `gpt-5.4-nano`
- `APP_PASSWORD`: 家族共有用の任意パスワード。空ならパスワードなし

`APP_PASSWORD` を設定した場合、画面右上の「共有パスワード」に同じ文字列を入れると生成できます。
