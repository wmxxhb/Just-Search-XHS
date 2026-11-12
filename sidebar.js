'use strict';

let focusSidebar;
let focusSidebarButton;
let focusSidebarPending = false;
let focusSidebarRoots = [];
let focusSidebarRows = new Map();
let focusSidebarFooters = new Set();
let focusSidebarObserver;
let focusStructureObserver;
let focusSidebarResizeObserver;
let focusSidebarWatching = false;
const NAV_REGION_SELECTOR = '.side-bar,.information-container,.bottom-menu';
const NAV_LEAF_SELECTOR = '.channel,.text,.information-wrapper,.about-us-block,a';
const IGNORED_LABEL_SELECTOR = 'svg,.count,.badge,script,style';
const SIDEBAR_LABELS = {
  '首页': 'home', '发现': 'home', '点点': 'ai', '点点ai': 'ai',
  'red': 'red', '直播': 'live', '发布': 'publish', '通知': 'notifications',
  '消息': 'messages', '我': 'profile', '更多': 'more', '关于我们': 'about'
};
// Lucide panel-left, ISC license: icons/LUCIDE-LICENSE.txt.
const FOCUS_SIDEBAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';

function getFocusSidebar() {
  return focusSidebar?.isConnected ? focusSidebar : undefined;
}

function sidebarItemId(element) {
  const label = element.querySelector('.channel,.text') || element;
  // Read text without cloning every menu subtree; skip SVG titles and badges.
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest(IGNORED_LABEL_SELECTOR)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  let text = '';
  while (walker.nextNode()) text += walker.currentNode.nodeValue;
  const id = SIDEBAR_LABELS[text.replace(/\s+/g, '').toLowerCase()];
  if (id) return id;
  const href = element.closest('a')?.getAttribute('href') || '';
  if (/^\/explore(?:[?#]|$)/.test(href)) return 'home';
  if (/^\/red_video(?:[/?#]|$)/.test(href)) return 'red';
  if (/^\/livelist(?:[/?#]|$)/.test(href)) return 'live';
  if (href.startsWith('https://creator.xiaohongshu.com/publish/')) return 'publish';
  return undefined;
}

function disconnectSidebarObservers() {
  focusSidebarObserver?.disconnect();
  focusStructureObserver?.disconnect();
  focusSidebarResizeObserver?.disconnect();
  focusSidebarWatching = false;
}

function stopSidebarObservers() {
  disconnectSidebarObservers();
  // Detached site nodes can now be collected while this tab is hidden.
  focusSidebarRoots = [];
  focusSidebarRows.clear();
  focusSidebarFooters.clear();
  focusSidebar = undefined;
  if (!focusSidebarButton?.isConnected) focusSidebarButton = undefined;
}

function refreshSidebarRoots() {
  disconnectSidebarObservers();
  focusSidebar = document.querySelector('.side-bar');
  const regions = [...document.querySelectorAll(NAV_REGION_SELECTOR)];
  for (const leaf of document.querySelectorAll('.information-wrapper,.about-us-block')) {
    if (!leaf.closest(NAV_REGION_SELECTOR)) regions.push(leaf);
  }
  const unique = [...new Set(regions)];
  focusSidebarRoots = unique.filter(node => !unique.some(parent => parent !== node && parent.contains(node)));
  // A hidden tab may have had its old navigation containers reused for other content.
  for (const node of document.querySelectorAll('[data-xhs-sidebar-hidden],[data-xhs-sidebar-region],[data-xhs-sidebar-empty]')) {
    if (!focusSidebarRoots.some(region => region === node || region.contains(node))) {
      node.removeAttribute('data-xhs-sidebar-hidden');
      node.removeAttribute('data-xhs-sidebar-region');
      node.removeAttribute('data-xhs-sidebar-empty');
    }
  }
}

function refreshSidebarRows() {
  const rows = new Map();
  const footers = new Set();
  for (const region of focusSidebarRoots) {
    if (region.matches('.information-container')) footers.add(region);
    for (const footer of region.querySelectorAll('.information-container')) footers.add(footer);
    const leaves = [...region.querySelectorAll(NAV_LEAF_SELECTOR)];
    if (region.matches(NAV_LEAF_SELECTOR)) leaves.unshift(region);
    for (const leaf of leaves) {
      const id = sidebarItemId(leaf);
      if (!id) continue;
      const row = leaf.closest('.about-us-block') || leaf.closest('.information-wrapper')
        || leaf.closest('li') || leaf.closest('.bottom-channel')
        || leaf.closest('.bottom-menu-component') || leaf.closest('a') || leaf;
      rows.set(row, id);
    }
  }
  // Recover reused rows, including mutations that happened while observers were paused.
  for (const region of focusSidebarRoots) {
    const marked = [...region.querySelectorAll('[data-xhs-sidebar-hidden],[data-xhs-sidebar-region],[data-xhs-sidebar-empty]')];
    if (region.matches('[data-xhs-sidebar-hidden],[data-xhs-sidebar-region],[data-xhs-sidebar-empty]')) marked.push(region);
    for (const node of marked) {
      if (!rows.has(node)) node.removeAttribute('data-xhs-sidebar-hidden');
      if (!rows.has(node) && !footers.has(node)) node.removeAttribute('data-xhs-sidebar-region');
      if (!footers.has(node)) node.removeAttribute('data-xhs-sidebar-empty');
    }
  }
  focusSidebarRows = rows;
  focusSidebarFooters = footers;
}

function updateSidebarCustomization(refreshStructure = false) {
  if (!runtimeActive || document.hidden || !document.body) return;
  setFlag(document.documentElement, 'data-xhs-sidebar-collapsed', currentSettings.sidebarCollapsed);
  if (refreshStructure || !focusSidebarWatching || (focusSidebar && !focusSidebar.isConnected)
      || focusSidebarRoots.some(node => !node.isConnected)) refreshSidebarRoots();
  refreshSidebarRows();
  const hiddenItems = new Set(SIDEBAR_ITEMS.filter(item => item.inverted
    ? currentSettings[item.key] : !currentSettings[item.key]).map(item => item.id));
  for (const [row, id] of focusSidebarRows) {
    setFlag(row, 'data-xhs-sidebar-hidden', hiddenItems.has(id));
    setFlag(row, 'data-xhs-sidebar-region', id === 'more' || id === 'about');
  }
  for (const footer of focusSidebarFooters) {
    setFlag(footer, 'data-xhs-sidebar-region', true);
    setFlag(footer, 'data-xhs-sidebar-empty', hiddenItems.has('more') && hiddenItems.has('about'));
  }

  if (!getFocusSidebar()) {
    focusSidebarButton?.remove();
    focusSidebarButton = undefined;
  } else {
    if (!focusSidebarButton?.isConnected) {
      focusSidebarButton = document.createElement('button');
      focusSidebarButton.id = 'xhs-focus-sidebar-toggle';
      focusSidebarButton.type = 'button';
      focusSidebarButton.innerHTML = FOCUS_SIDEBAR_ICON;
      focusSidebarButton.addEventListener('click', async () => {
        if (focusSidebarPending) return;
        focusSidebarPending = true;
        focusSidebarButton.disabled = true;
        try {
          await chrome.storage.sync.set({ sidebarCollapsed: !currentSettings.sidebarCollapsed });
        } catch (error) {
          console.error('[Just Search XHS] 侧栏状态保存失败', error);
        } finally {
          focusSidebarPending = false;
          if (focusSidebarButton) focusSidebarButton.disabled = false;
        }
      });
      document.body.appendChild(focusSidebarButton);
    }
    const collapsed = Boolean(currentSettings.sidebarCollapsed);
    const label = collapsed ? '展开侧栏' : '收起侧栏';
    setAttributeValue(focusSidebarButton, 'aria-label', label);
    setAttributeValue(focusSidebarButton, 'title', label);
    setAttributeValue(focusSidebarButton, 'aria-expanded', String(!collapsed));
  }
  watchSidebarChanges();
}

function positionSidebarButton(rect) {
  if (!focusSidebarButton) return;
  const left = !currentSettings.sidebarCollapsed && rect?.width && rect.right < innerWidth * .5
    ? Math.max(12, Math.ceil(rect.right) - 44) : 12;
  const value = `${left}px`;
  if (focusSidebarButton.style.left !== value) focusSidebarButton.style.left = value;
}

function isExtensionNode(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && Boolean(node.closest('#xhs-focus-home,#xhs-focus-sidebar-toggle'));
}

function watchSidebarChanges() {
  if (!runtimeActive || document.hidden || focusSidebarWatching) return;
  if (!focusSidebarObserver) {
    focusSidebarObserver = new MutationObserver(() => scheduleRuntimeUpdate({ sidebar: true }));
    focusStructureObserver = new MutationObserver(records => {
      const changed = records.some(record =>
        [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && !isExtensionNode(node))
        || [...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE));
      if (changed) scheduleRuntimeUpdate({ all: true, structure: true });
    });
    focusSidebarResizeObserver = new ResizeObserver(() => scheduleRuntimeUpdate({ position: true }));
  }
  // Frequent post/comment updates are outside these small navigation roots.
  for (const region of focusSidebarRoots) {
    focusSidebarObserver.observe(region, {
      childList: true, characterData: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'href', 'title']
    });
  }
  // Watch replacement of navigation ancestors, without observing their content subtrees.
  const hosts = new Set([document.body]);
  for (const selector of ['#app', '.layout', '.main-container']) {
    const host = document.querySelector(selector);
    if (host) hosts.add(host);
  }
  for (const region of focusSidebarRoots) {
    for (let host = region.parentElement; host && host !== document.body; host = host.parentElement) {
      hosts.add(host);
    }
  }
  for (const host of hosts) focusStructureObserver.observe(host, { childList: true });
  if (getFocusSidebar()) focusSidebarResizeObserver.observe(focusSidebar);
  focusSidebarWatching = true;
}
