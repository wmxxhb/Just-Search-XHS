'use strict';

const STYLE_IDS = {
  feed: 'xhs-blocker-feed-style',
  searchSuggest: 'xhs-blocker-search-suggest-style',
  notificationBadge: 'xhs-blocker-notification-badge-style',
  notificationEntry: 'xhs-blocker-notification-entry-style',
  images: 'xhs-blocker-image-style'
};
const FEATURE_CSS = {
  feed: '.feeds-container,.reds-sticky-box,.channel-container{display:none!important}',
  searchSuggest: '.sug-box{display:none!important}',
  notificationBadge: '.badge-container .count,.count{display:none!important}',
  notificationEntry: 'a[href="/notification"],a[title="通知"]{display:none!important}'
};

let currentSettings = { ...DEFAULT_SETTINGS };
let lastURL = location.href;
let runtimeReady = false;
let runtimeActive = false;
let updateFrame;
let nativeLayoutRefreshFrame;
let legacyURLTimer;
let feedReloadPending = false;
let homeReloadNeeded = false;
let nativeResizeNeeded = false;
let appliedHideFeed;
let pendingAll = true;
let pendingSidebar = true;
let pendingStructure = true;
let pendingPosition = true;
const hasNavigationEvents = Boolean(window.navigation && 'oncurrententrychange' in window.navigation);

function shouldHideFeed() {
  return location.pathname === '/' || location.pathname === '/explore';
}

// Preserve layout dimensions during startup so the site's masonry layout can measure itself.
if (shouldHideFeed()) {
  const style = document.createElement('style');
  style.id = 'xhs-blocker-initial-style';
  style.textContent = '.feeds-container,.reds-sticky-box,.channel-container{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(style);
}

function setFlag(element, name, enabled) {
  if (element.hasAttribute(name) !== Boolean(enabled)) element.toggleAttribute(name, Boolean(enabled));
}

function setAttributeValue(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function manageStyle(id, css, enabled) {
  let style = document.getElementById(id);
  if (!enabled) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } else if (style.textContent !== css) {
    style.textContent = css;
  }
}

function applyAllSettings() {
  document.getElementById('xhs-blocker-initial-style')?.remove();
  manageStyle(STYLE_IDS.feed, FEATURE_CSS.feed, currentSettings.hideFeed && shouldHideFeed());
  manageStyle(STYLE_IDS.searchSuggest, FEATURE_CSS.searchSuggest, true);
  manageStyle(STYLE_IDS.notificationBadge, FEATURE_CSS.notificationBadge, currentSettings.hideNotificationBadge);
  manageStyle(STYLE_IDS.notificationEntry, FEATURE_CSS.notificationEntry, currentSettings.hideNotificationEntry);
  // The image-only filter was retired; old settings must never hide search media.
  document.getElementById(STYLE_IDS.images)?.remove();
  updateCenteredHomepage();
  appliedHideFeed = currentSettings.hideFeed;
}

// All event sources share one frame instead of scheduling independent scans and layout reads.
function scheduleRuntimeUpdate({ all = false, sidebar = false, structure = false, position = false } = {}) {
  pendingAll ||= all;
  pendingSidebar ||= sidebar;
  pendingStructure ||= structure;
  pendingPosition ||= position;
  if (!runtimeReady || !runtimeActive || document.hidden || updateFrame !== undefined) return;
  updateFrame = requestAnimationFrame(flushRuntimeUpdate);
}

function flushRuntimeUpdate() {
  updateFrame = undefined;
  if (!runtimeActive || document.hidden) return;
  if (location.href !== lastURL) {
    lastURL = location.href;
    pendingAll = true;
    pendingStructure = true;
  }
  if (homeReloadNeeded) {
    homeReloadNeeded = false;
    if (shouldHideFeed() && appliedHideFeed !== undefined && appliedHideFeed !== currentSettings.hideFeed) {
      feedReloadPending = true;
      location.reload();
      return;
    }
  }
  const all = pendingAll;
  const sidebar = pendingSidebar || pendingStructure || all;
  const structure = pendingStructure;
  const position = pendingPosition || sidebar || all;
  pendingAll = pendingSidebar = pendingStructure = pendingPosition = false;
  if (all) applyAllSettings();
  if (sidebar) updateSidebarCustomization(structure);
  if (position) {
    // Measure once, then reuse the same sidebar geometry for both controls.
    const rect = getFocusSidebar()?.getBoundingClientRect();
    updateFocusHomePosition(rect);
    positionSidebarButton(rect);
  }
  if (nativeResizeNeeded) {
    nativeResizeNeeded = false;
    nativeLayoutRefreshFrame = requestAnimationFrame(() => {
      nativeLayoutRefreshFrame = undefined;
      if (runtimeActive && !document.hidden) window.dispatchEvent(new Event('resize'));
    });
  }
}

function handleURLChange() {
  if (runtimeActive && location.href !== lastURL) scheduleRuntimeUpdate({ all: true, structure: true });
}

function pauseRuntime() {
  runtimeActive = false;
  if (legacyURLTimer !== undefined) clearInterval(legacyURLTimer);
  legacyURLTimer = undefined;
  if (updateFrame !== undefined) cancelAnimationFrame(updateFrame);
  updateFrame = undefined;
  if (nativeLayoutRefreshFrame !== undefined) {
    cancelAnimationFrame(nativeLayoutRefreshFrame);
    nativeResizeNeeded = true;
  }
  nativeLayoutRefreshFrame = undefined;
  stopSidebarObservers();
  pendingAll = pendingSidebar = pendingStructure = pendingPosition = true;
}

function resumeRuntime() {
  if (!runtimeReady || document.hidden || feedReloadPending) return;
  runtimeActive = true;
  // Older browsers only: the fallback exists exclusively while this page is visible.
  if (!hasNavigationEvents && legacyURLTimer === undefined) {
    legacyURLTimer = setInterval(handleURLChange, 1000);
  }
  scheduleRuntimeUpdate({ all: true, structure: true, position: true });
}

function setupLifecycle() {
  window.addEventListener('popstate', handleURLChange);
  window.addEventListener('hashchange', handleURLChange);
  if (hasNavigationEvents) window.navigation.addEventListener('currententrychange', handleURLChange);
  window.addEventListener('resize', () => {
    if (runtimeActive) scheduleRuntimeUpdate({ position: true });
  }, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? pauseRuntime() : resumeRuntime());
  window.addEventListener('pagehide', pauseRuntime);
  window.addEventListener('pageshow', resumeRuntime);
  document.addEventListener('freeze', pauseRuntime);
  document.addEventListener('resume', resumeRuntime);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let changed = false;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      const value = newValue ?? DEFAULT_SETTINGS[key];
      if (currentSettings[key] === value) continue;
      if (key === 'hideFeed' && shouldHideFeed()) homeReloadNeeded = true;
      if (key === 'sidebarCollapsed') nativeResizeNeeded = true;
      currentSettings[key] = value;
      changed = true;
    }
    // Hidden tabs only update settings in memory; DOM work waits until they become visible.
    if (changed) scheduleRuntimeUpdate({ all: true });
  });
}

async function initialize() {
  currentSettings = await new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, result => {
      if (chrome.runtime.lastError) {
        console.error('[Just Search XHS] 设置读取失败');
        resolve({ ...DEFAULT_SETTINGS });
      } else {
        resolve(result);
      }
    });
  });
  setupLifecycle();
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  runtimeReady = true;
  resumeRuntime();
}

initialize();
