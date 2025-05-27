# Spec

## 概要

このドキュメントでは[requirements.md](./requirements.md)で定義された要件に基づいて、プロジェクトの仕様を記述します。

## API

### 共通仕様

- レスポンスは常にJSON形式で返す。
- 認証は不要。
- エラーハンドリング

  エラーレスポンスは以下の形式とする。

  ```json
  {
    "code": "URL_REQUIRED",
    "message": "urlフィールドは必須です"
  }
  ```

#### エラーコード一覧

- `JSON_INVALID`: リクエストボディが不正なJSON
- `URL_REQUIRED`: urlフィールドが必須
- `URL_TOO_LONG`: urlが4096文字を超過
- `URL_INVALID_FORMAT`: urlが不正な形式

### POST /api/shorten

- リクエスト例:

  ```json
  {
    "url": "https://example.com/some/long/url"
  }
  ```

- url: 必須、4096文字以下、有効なURL形式
- 同じURLが既に短縮されていれば同じ短縮URLを返す
- レスポンス例:

  ```json
  {
    "short_url": "https://example.com/abc123"
  }
  ```

- Rate Limit: 1IPあたり1日10回まで。超過時は429エラー、レスポンスヘッダーに以下を付与:
  - X-RateLimit-Limit
  - X-RateLimit-Remaining
  - X-RateLimit-Reset
  - Retry-After

### GET /:short_code

- リクエスト例:

  GET /abc123

- レスポンス: 308 Permanent Redirect で元のURLへリダイレクト
- Rate Limitなし

## データモデル

- urls テーブル (Cloudflare D1)
  - original_url: TEXT NOT NULL
  - short_code: TEXT NOT NULL UNIQUE
  - created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

## Rate Limit

- Cloudflare Workers KVで実装
- 1IPごとに1日10回まで
- レスポンスヘッダーで残回数・リセット時刻等を返す

## 利用技術

- デプロイ先: Cloudflare Workers
- DB: Cloudflare D1
- KV: Cloudflare Workers KV
- Webフレームワーク: Hono
