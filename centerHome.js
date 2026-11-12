'use strict';

// The original navigation stays on the page. Only the empty home area is replaced.
let focusHomeRoot;
let focusHomeFrame;
let focusHomeEnabled = false;
let focusHomeObserver;

function updateCenteredHomepage() {
  const enabled = currentSettings.hideFeed && shouldHideFeed();
  focusHomeEnabled = Boolean(enabled);
  document.documentElement.toggleAttribute('data-xhs-focus-home', focusHomeEnabled);

  if (!focusHomeEnabled) {
    focusHomeRoot?.remove();
    focusHomeRoot = undefined;
    document.documentElement.style.removeProperty('--xhs-focus-left');
    focusHomeObserver?.disconnect();
    return;
  }
  if (!document.body) return;

  if (!focusHomeRoot?.isConnected) {
    focusHomeRoot = document.createElement('section');
    focusHomeRoot.id = 'xhs-focus-home';
    focusHomeRoot.setAttribute('aria-label', '小红书搜索');
    focusHomeRoot.innerHTML = `
      <form class="xhs-focus-search" role="search" action="/search_result" method="get">
        <label class="xhs-focus-sr-only" for="xhs-focus-keyword">搜索小红书</label>
        <input id="xhs-focus-keyword" name="keyword" type="search"
          placeholder="搜索你想了解的内容" autocomplete="off" maxlength="200"
          enterkeyhint="search" required>
        <input name="source" type="hidden" value="web_explore_feed">
        <button type="submit">搜索</button>
      </form>`;
    const form = focusHomeRoot.querySelector('form');
    const input = focusHomeRoot.querySelector('input[type="search"]');
    form.addEventListener('submit', (event) => {
      const keyword = input.value.trim();
      if (!keyword) {
        event.preventDefault();
        input.value = '';
        input.focus();
      } else {
        input.value = keyword;
      }
    });
    document.body.appendChild(focusHomeRoot);
  }

  updateFocusHomePosition();
  if (!focusHomeObserver) {
    focusHomeObserver = new MutationObserver(() => {
      if (!focusHomeEnabled || focusHomeFrame) return;
      focusHomeFrame = requestAnimationFrame(() => {
        focusHomeFrame = undefined;
        // Also catches SPA navigation before the original URL polling fallback.
        handleURLChange();
        if (focusHomeEnabled) updateFocusHomePosition();
      });
    });
  }
  focusHomeObserver.observe(document.body, {childList: true, subtree: true});
}

function updateFocusHomePosition() {
  if (!focusHomeEnabled) return;
  // Measure the site's own navigation instead of assuming a fixed sidebar width.
  const sidebar = document.querySelector('.side-bar');
  const rect = sidebar?.getBoundingClientRect();
  const left = rect && rect.width > 0 && rect.right > 0 && rect.right < innerWidth * .5
    ? Math.ceil(rect.right) : 0;
  const value = `${left}px`;
  if (document.documentElement.style.getPropertyValue('--xhs-focus-left') !== value) {
    document.documentElement.style.setProperty('--xhs-focus-left', value);
  }
}

window.addEventListener('resize', updateFocusHomePosition, {passive: true});
