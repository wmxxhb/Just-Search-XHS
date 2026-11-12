'use strict';

let focusHomeRoot;
let focusHomeEnabled = false;

function updateCenteredHomepage() {
  focusHomeEnabled = Boolean(currentSettings.hideFeed && shouldHideFeed());
  setFlag(document.documentElement, 'data-xhs-focus-home', focusHomeEnabled);
  if (!focusHomeEnabled) {
    focusHomeRoot?.remove();
    focusHomeRoot = undefined;
    document.documentElement.style.removeProperty('--xhs-focus-left');
    return;
  }
  if (!document.body || focusHomeRoot?.isConnected) return;
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
  const input = focusHomeRoot.querySelector('input[type="search"]');
  focusHomeRoot.querySelector('form').addEventListener('submit', event => {
    const keyword = input.value.trim();
    input.value = keyword;
    if (!keyword) {
      event.preventDefault();
      input.focus();
    }
  });
  document.body.appendChild(focusHomeRoot);
}

function updateFocusHomePosition(rect) {
  if (!focusHomeEnabled) return;
  const left = rect && rect.width > 0 && rect.right > 0 && rect.right < innerWidth * .5
    ? Math.ceil(rect.right) : 0;
  const value = `${left}px`;
  if (document.documentElement.style.getPropertyValue('--xhs-focus-left') !== value) {
    document.documentElement.style.setProperty('--xhs-focus-left', value);
  }
}
