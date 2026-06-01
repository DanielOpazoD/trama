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
  deleteBookmark,
  XApiError,
  type NormalizedBookmark,
  type StoredBookmark,
} from './sync.js'
export { isXConfigured } from './client.js'
export {
  runClassify,
  buildClassifyMessages,
  parseClassifications,
  TOPIC_CATEGORIES,
  type Topic,
  type ClassifyInvocation,
} from './classify.js'
export {
  buildBookmarkCronicaMessages,
  selectBookmarksForCronica,
  getLatestXCronica,
  insertXCronica,
  softDeleteXCronicas,
  type StoredXCronica,
} from './cronica.js'
