# Spec

## 概要

このドキュメントでは[requirements.md](./requirements.md)で定義された要件に基づいて、プロジェクトの仕様を記述します。

## API

### 共通する仕様

- レスポンスは常にJSON形式で返される。
- 認証はしない
- エラーハンドリング
  - エラーレスポンスフォーマットは以下のようにする。
    ```json
    {
      "code": "url_is_required",
      "message": "URL is required"
    }
    ```

## 共通エラー仕様

APIのエラーレスポンスは以下の型・コードを共通で利用します。

### 型

```jsonc
{
  "message": string, // エラー内容
  "code": "JSON_INVALID" | "URL_REQUIRED" | "URL_TOO_LONG" | "URL_INVALID_FORMAT" // エラーコード
}
```


### エラーコード一覧

- `JSON_INVALID`: リクエストボディが不正なJSON
- `URL_REQUIRED`: urlフィールドが必須
- `URL_TOO_LONG`: urlが4096文字を超過
- `URL_INVALID_FORMAT`: urlが不正な形式

### POST /api/shorten

以下がリクエストの例:

```http
POST /api/shorten
{
  "url": "https://example.com/some/long/url"
}
```

- `url`: 短縮したいURL
  - 必須
  - 文字列
  - 制約
    - 有効なURL形式である必要がある
    - 長さは4096文字以下

以下がレスポンスの例:

```json
{
  "short_url": "https://example.com/abc123"
}
```

Rate Limitが存在します。あるIPアドレスは1日に100回までこのエンドポイントを呼び出すことができます。Rate Limitを超えた場合、429 Too Many Requestsエラーが返され、レスポンスヘッダー内の`Retry-After`でリセット時刻が示されます。Rate Limitの情報は、レスポンスヘッダーに、`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`として含まれます。

内部の処理としては、リクエストボディで指定されたURLを短縮し、短縮URLを生成します。もし同じURLが既に短縮されている場合は、同じ短縮URLを返します。短縮URLは永続化され、データベースに保存されます。

### GET /:short_code

以下がリクエストの例:

```http
GET /abc123
```

以下がレスポンスの例:

```http
HTTP/1.1 308 Permanent Redirect
Location: https://example.com/some/long/url
```

本エンドポイントにはRate Limitは適用されません。

内部の処理としては、短縮URLを元のURLにリダイレクトします。まずshort_codeから元のURLを取得します。見つかった場合はそのURLにリダイレクトします。リダイレクトには308 Permanent Redirectを使用します。

## データモデル

以下のテーブルをD1データベースに作成します。

- urls
  - original_url: TEXT NOT NULL
  - short_code: TEXT NOT NULL UNIQUE
  - created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

## Rate Limit

Rate LimitはCloudflare Workers KVを使用して実装します。IPアドレスごとに1日に10回までの制限を設けます。

## 利用技術

デプロイ先はCloudflare Workersです。

メインのデータベースとして Cloudflare D1 を使用します。短縮URLや元のURLの保存に利用されます。

Rate Limitの実装には Cloudflare Workers KV を使用します。これにより、短縮URLの生成やリダイレクトの高速化が可能になります。

WebフレームワークとしてHonoを利用します。
