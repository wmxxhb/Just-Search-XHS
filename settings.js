'use strict';

// Used by both the content scripts and the settings popup.
const SIDEBAR_ITEMS = [
  { id: 'home', label: '首页', key: 'sidebarShowHome' },
  { id: 'ai', label: '点点 AI', key: 'sidebarShowAI' },
  { id: 'red', label: 'RED', key: 'sidebarShowRED' },
  { id: 'live', label: '直播', key: 'sidebarShowLive' },
  { id: 'publish', label: '发布', key: 'sidebarShowPublish' },
  { id: 'notifications', label: '通知', key: 'hideNotificationEntry', inverted: true },
  { id: 'messages', label: '消息', key: 'sidebarShowMessages' },
  { id: 'profile', label: '我', key: 'sidebarShowProfile' },
  { id: 'more', label: '更多', key: 'sidebarShowMore' },
  { id: 'about', label: '关于我们', key: 'sidebarShowAbout' }
];

const DEFAULT_SETTINGS = {
  hideFeed: true,
  hideNotificationBadge: false,
  hideNotificationEntry: true,
  sidebarCollapsed: false,
  ...Object.fromEntries(SIDEBAR_ITEMS.filter(item => !item.inverted)
    .map(item => [item.key, ['home', 'messages', 'profile'].includes(item.id)]))
};
