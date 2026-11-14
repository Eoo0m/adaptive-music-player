// ===== Global Store =====
// 모든 모듈이 공유하는 전역 상태

const API_BASE_URL = 'https://api.caromusic.kr';

// Auth
let authToken = localStorage.getItem('auth_token');
let currentUser = null;

// Favorites / Map / Feed 캐시
let lastFavorites = [];
let lastSavedPlaylists = [];
let lastHomeFeeds = [];
window.lastMapData = null;
let lastMapData = null;
let mapPrefetchPromise = null;
let mapIntroShown = false;
let _mapLoopDestroy = null;

// Player 상태
let playerCurrentTrack = null;
let playerIsPlaying = false;
let playerPlayStartTime = null;
let playerCurrentDuration = null;

// 탭 / 큐
let currentTab = 'search';
let currentPlaylistQueue = null;
let currentPlaylistIndex = -1;

// 추천
let lastRecommendationTracks = [];
let lastRecommendationIndex = 0;
const recommendationViewMode = 'grid';

// Click history (Two-Tower)
let clickedTracks = [];
let shownRecommendationKeys = [];

// Action log
let currentCandidateKeys = [];

// Home feed 캐시
let _homeFeedCache = null;

// Session
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
let sessionId = generateSessionId();
console.log('🎵 Session initialized:', sessionId);
