/**
 * Barrel del paquete X (Twitter). Los handlers importan de acá.
 */
export {
  X_SCOPES,
  generatePkce,
  buildAuthUrl,
  exchangeCodeForTokens,
  getStoredTokens,
  saveTokens,
  getValidAccessToken,
  markSynced,
  disconnectX,
  getXProfile,
  type StoredXTokens,
} from './auth.js'
export {
  fetchBookmarks,
  storeBookmarks,
  listBookmarks,
  XApiError,
  type NormalizedBookmark,
  type StoredBookmark,
} from './sync.js'
export { isXConfigured } from './client.js'
