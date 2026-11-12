'use strict';

let focusSidebarButton;
let focusSidebarObserver;
let focusSidebarFrame;
let focusSidebarPending = false;
const focusSidebarHidden = new Set();
// Lucide panel-left, ISC license: icons/LUCIDE-LICENSE.txt.
const FOCUS_SIDEBAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';

function sidebarItemId(element) {
  const label = element.querySelector('.channel, .text') || element;
  const clone = label.cloneNode(true);
  // SVG titles and badges are not menu labels (e.g. "menu更多" or "消息3").
  clone.querySelectorAll('svg, .count, .badge, script, style').forEach(node => node.remove());
  const text = (clone.textContent || '').replace(/\s+/g, '').toLowerCase();
  const labels = {
    '首页': 'home', '发现': 'home', '点点': 'ai', '点点ai': 'ai',
    'red': 'red', '直播': 'live', '发布': 'publish', '通知': 'notifications',
    '消息': 'messages', '我': 'profile', '更多': 'more', '关于我们': 'about'
  };
  if (labels[text]) return labels[text];
  const href = element.closest('a')?.getAttribute('href') || '';
  if (/^\/explore(?:[?#]|$)/.test(href)) return 'home';
  if (/^\/red_video(?:[/?#]|$)/.test(href)) return 'red';
  if (/^\/livelist(?:[/?#]|$)/.test(href)) return 'live';
  if (href.startsWith('https://creator.xiaohongshu.com/publish/')) return 'publish';
  return undefined;
}

function updateSidebarCustomization() {
  const root = document.documentElement;
  root.toggleAttribute('data-xhs-sidebar-collapsed', Boolean(currentSettings.sidebarCollapsed));
  if (!document.body) return;
  const sidebar = document.querySelector('.side-bar');

  const hiddenItems = new Set(SIDEBAR_ITEMS.filter(item => item.inverted
    ? currentSettings[item.key] : !currentSettings[item.key]).map(item => item.id));
  const rows = new Map();
  // Some versions render the footer outside .side-bar. Include it directly,
  // together with the site's mobile menu, instead of relying on DOM ancestry.
  const leaves = document.querySelectorAll(
    '.side-bar .channel, .side-bar a, .bottom-menu .text, .bottom-menu a, '
    + '.information-wrapper, .about-us-block'
  );
  for (const leaf of leaves) {
    const id = sidebarItemId(leaf);
    if (!id) continue;
    const row = leaf.closest('.about-us-block') || leaf.closest('.information-wrapper')
      || leaf.closest('li') || leaf.closest('.bottom-channel') || leaf.closest('.bottom-menu-component')
      || leaf.closest('a') || leaf;
    rows.set(row, id);
  }

  // Remove old marks too, including when the app reuses a row for a different menu item.
  for (const row of focusSidebarHidden) {
    if (!rows.has(row) || !hiddenItems.has(rows.get(row))) {
      row.removeAttribute('data-xhs-sidebar-hidden');
      focusSidebarHidden.delete(row);
    }
  }
  for (const [row, id] of rows) {
    if (hiddenItems.has(id)) {
      row.setAttribute('data-xhs-sidebar-hidden', '');
      focusSidebarHidden.add(row);
    }
  }

  for (const footer of document.querySelectorAll('.information-container')) {
    footer.setAttribute('data-xhs-sidebar-region', '');
    footer.toggleAttribute('data-xhs-sidebar-empty', hiddenItems.has('more') && hiddenItems.has('about'));
  }
  // Standalone row containers also disappear when the whole sidebar is collapsed.
  for (const [row, id] of rows) {
    if (id === 'more' || id === 'about') row.setAttribute('data-xhs-sidebar-region', '');
    else row.removeAttribute('data-xhs-sidebar-region');
  }

  if (!sidebar) {
    focusSidebarButton?.remove();
    focusSidebarButton = undefined;
    watchSidebarChanges();
    return;
  }

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
        // Do not leave an unsaved state on screen if browser storage fails.
        console.error('[Xiaohongshu Focus] 侧栏状态保存失败', error);
      } finally {
        focusSidebarPending = false;
        if (focusSidebarButton) focusSidebarButton.disabled = false;
      }
    });
    document.body.appendChild(focusSidebarButton);
  }

  const collapsed = Boolean(currentSettings.sidebarCollapsed);
  const label = collapsed ? '展开侧栏' : '收起侧栏';
  focusSidebarButton.setAttribute('aria-label', label);
  focusSidebarButton.setAttribute('title', label);
  focusSidebarButton.setAttribute('aria-expanded', String(!collapsed));
  positionSidebarButton();
  updateFocusHomePosition();
  watchSidebarChanges();
}

function positionSidebarButton() {
  if (!focusSidebarButton) return;
  const sidebar = document.querySelector('.side-bar');
  const rect = sidebar?.getBoundingClientRect();
  const left = !currentSettings.sidebarCollapsed && rect?.width && rect.right < innerWidth * .5
    ? Math.max(12, Math.ceil(rect.right) - 44) : 12;
  focusSidebarButton.style.left = `${left}px`;
}

function watchSidebarChanges() {
  if (!focusSidebarObserver) {
    focusSidebarObserver = new MutationObserver(records => {
      const relevant = records.some(record => {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        return node && !node.closest('#xhs-focus-sidebar-toggle, #xhs-focus-home');
      });
      if (!relevant || focusSidebarFrame) return;
      focusSidebarFrame = requestAnimationFrame(() => {
        focusSidebarFrame = undefined;
        updateSidebarCustomization();
      });
    });
  }
  focusSidebarObserver.observe(document.body, {childList: true, characterData: true, subtree: true});
}

window.addEventListener('resize', positionSidebarButton, {passive: true});
