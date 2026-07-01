# 歌詞和訳 下書き作成ローカルアプリ

## 起動

初回だけ依存関係を入れます。

```sh
npm install
```

```sh
npm start
```

起動後、ブラウザで `http://127.0.0.1:4173` を開きます。

## OpenAI APIキー

`.env` を作成して `OPENAI_API_KEY=...` を書きます。

モデルは安価優先で `gpt-5.4-nano` を使います。変更したい場合だけ `.env` の `OPENAI_MODEL` を編集します。

## 広告位置

歌詞欄の中で広告を入れたい位置に、単独行で `[AD]` と入力します。

## やりたい曲リスト

翻訳したい曲をFirebase Firestoreに保存できます。

- アーティスト名と曲名だけで追加できます
- 任意で英題、アルバム、作詞、メモなどを残せます
- 完了/未完了のチェックを手動で切り替えられます
- 「反映」ボタンで曲情報フォームに流し込めます
- 以前ブラウザ内に保存していたリストがあり、Firebase側が空の場合は初回だけ自動で移行します

### Firebase設定

Firestoreを作成し、Firebase Admin SDK用のサービスアカウントキーを発行します。

ローカルでは、サービスアカウントJSONをbase64化して `.env` に設定します。

```sh
FIREBASE_SERVICE_ACCOUNT_BASE64=...
FIREBASE_TODOS_COLLECTION=songTodos
```

VercelのEnvironment Variablesにも同じ値を設定します。
`FIREBASE_TODOS_COLLECTION` は省略すると `songTodos` になります。

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
- `FIREBASE_SERVICE_ACCOUNT_BASE64`: FirebaseサービスアカウントJSONをbase64化した文字列
- `FIREBASE_TODOS_COLLECTION`: 通常は `songTodos`
