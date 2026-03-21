/**
 * 静的アイコン系（/images/profiles, /images/icons）の最大幅（px）。
 *
 * - リクエスト時: `image_optimize` がこの幅に収めた WebP を返す（元が JPEG / PNG / WebP いずれでも可）
 * - デプロイ前: `optimizeAssets.ts` がプロフィールを同じ上限の **WebP ファイル**（`*.webp`）として書き出し、
 *   イメージに焼くと転送量と実行時のデコード負荷を抑えられる
 *
 * 値を変えるときはこのファイルのみを直し、両経路で自動的に揃う。
 */
export const MAX_ICON_WIDTH = 256;

/** プロフィール等アイコン系の WebP 品質（ミドルウェアと optimizeAssets で共有） */
export const WEBP_ICON_QUALITY = 80;
