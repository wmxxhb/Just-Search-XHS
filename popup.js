'use strict';

const POPUP_CONTROLS = [
  { id: 'toggle-feed', key: 'hideFeed' },
  { id: 'toggle-notification-badge', key: 'hideNotificationBadge' },
  { id: 'toggle-sidebar-collapsed', key: 'sidebarCollapsed' },
  ...SIDEBAR_ITEMS.map(item => ({ ...item, id: `sidebar-${item.id}` }))
];

document.addEventListener('DOMContentLoaded', async () => {
  const options = document.getElementById('sidebar-menu-options');
  for (const item of SIDEBAR_ITEMS) {
    const label = document.createElement('label');
    label.className = 'sidebar-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `sidebar-${item.id}`;
    label.append(input, document.createTextNode(item.label));
    options.appendChild(label);
  }

  function render(settings) {
    for (const control of POPUP_CONTROLS) {
      const input = document.getElementById(control.id);
      input.checked = control.inverted ? !settings[control.key] : Boolean(settings[control.key]);
    }
  }

  let settings = { ...DEFAULT_SETTINGS };
  try {
    settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    render(settings);
  } catch {
    document.getElementById('settings-status').textContent = '设置读取失败，请重新打开扩展。';
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) settings[key] = change.newValue ?? DEFAULT_SETTINGS[key];
    }
    render(settings);
  });

  for (const control of POPUP_CONTROLS) {
    const input = document.getElementById(control.id);
    input.addEventListener('change', async () => {
      const value = control.inverted ? !input.checked : input.checked;
      input.disabled = true;
      try {
        await chrome.storage.sync.set({ [control.key]: value });
        settings[control.key] = value;
        document.getElementById('settings-status').textContent = '';
      } catch {
        render(settings);
        document.getElementById('settings-status').textContent = '保存失败，请重试。';
      } finally {
        input.disabled = false;
        render(settings);
      }
    });
  }
});
