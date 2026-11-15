/** Remembered per browser: a display preference only, so localStorage is fine. */
export const SIDEBAR_KEY = 'bgym:sidebar';
export const SIDEBAR_EVENT = 'bgym:sidebar';

/** Runs inline before the page paints, so a collapsed sidebar doesn't flash open. */
export const sidebarBootScript = `try{if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}`;

export function isSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === 'collapsed';
}

export function setSidebarCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // Private mode or storage blocked: the choice just isn't remembered.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}
