import browser from 'webextension-polyfill';
import {
  closeGroup,
  deleteGroupEverywhere,
  forceSyncNow,
  listSyncedGroups,
  listUnsharedLocalGroups,
  openGroup,
  shareGroup,
  type LocalGroupInfo,
  type SyncedGroupInfo,
} from '../lib/groupActions';
import { t } from '../lib/i18n';

const appElement = document.getElementById('app');
if (appElement === null) {
  throw new Error('#app not found');
}
const app: HTMLElement = appElement;

function section(title: string): HTMLElement {
  const wrapper = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = title;
  wrapper.appendChild(heading);
  return wrapper;
}

function emptyRow(text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

function groupRow(colorName: string, name: string, tabCount: number, buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'group';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'group-title';

  const dot = document.createElement('span');
  dot.className = 'group-color';
  dot.style.backgroundColor = colorName;
  dot.style.color = colorName;
  titleWrap.appendChild(dot);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'group-name';
  nameSpan.textContent = name || t('untitledGroup');
  titleWrap.appendChild(nameSpan);

  const countSpan = document.createElement('span');
  countSpan.className = 'group-count';
  countSpan.textContent = `(${tabCount})`;
  titleWrap.appendChild(countSpan);

  row.appendChild(titleWrap);

  const actions = document.createElement('div');
  actions.className = 'group-actions';
  for (const button of buttons) {
    actions.appendChild(button);
  }
  row.appendChild(actions);

  return row;
}

function makeButton(label: string, onClick: () => void, variant?: 'danger'): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  if (variant !== undefined) {
    button.classList.add(variant);
  }
  button.addEventListener('click', () => {
    button.disabled = true;
    onClick();
  });
  return button;
}

async function render(): Promise<void> {
  const [localGroups, syncedGroups] = await Promise.all([listUnsharedLocalGroups(), listSyncedGroups()]);

  const openGroups = syncedGroups.filter((info) => info.localGroupId !== undefined);
  const closedGroups = syncedGroups.filter((info) => info.localGroupId === undefined);

  app.innerHTML = '';
  app.appendChild(renderLocalSection(localGroups));
  app.appendChild(renderOpenSection(openGroups));
  app.appendChild(renderClosedSection(closedGroups));
}

// A single popup action (share/open/close/delete) can trigger several storage writes
// (e.g. storage.sync + the local mapping + the snapshot), each firing its own
// storage.onChanged event. Without coalescing, that fans out into multiple concurrent
// render() calls racing on the same DOM, which is what caused the list to flicker/
// duplicate before settling. This queues at most one extra render while one is in flight.
let renderInFlight = false;
let renderPending = false;

function scheduleRender(): void {
  if (renderInFlight) {
    renderPending = true;
    return;
  }

  renderInFlight = true;
  render()
    .catch((error: unknown) => {
      console.error('Failed to render popup', error);
    })
    .finally(() => {
      renderInFlight = false;
      if (renderPending) {
        renderPending = false;
        scheduleRender();
      }
    });
}

function renderLocalSection(groups: LocalGroupInfo[]): HTMLElement {
  const el = section(t('sectionLocalGroups'));
  if (groups.length === 0) {
    el.appendChild(emptyRow(t('emptyLocalGroups')));
    return el;
  }

  for (const group of groups) {
    const shareBtn = makeButton(t('buttonShare'), () => {
      void shareGroup(group.localGroupId).then(scheduleRender);
    });
    el.appendChild(groupRow(group.color, group.title, group.tabCount, [shareBtn]));
  }

  return el;
}

function renderOpenSection(groups: SyncedGroupInfo[]): HTMLElement {
  const el = section(t('sectionOpenGroups'));
  if (groups.length === 0) {
    el.appendChild(emptyRow(t('emptyOpenGroups')));
    return el;
  }

  for (const info of groups) {
    const localGroupId = info.localGroupId;
    if (localGroupId === undefined) {
      continue;
    }
    const closeBtn = makeButton(t('buttonClose'), () => {
      void closeGroup(localGroupId).then(scheduleRender);
    });
    const deleteBtn = makeButton(
      t('buttonDelete'),
      () => {
        void deleteGroupEverywhere(info.syncId, info.group.title).then(scheduleRender);
      },
      'danger',
    );
    el.appendChild(groupRow(info.group.color, info.group.title, info.group.tabs.length, [closeBtn, deleteBtn]));
  }

  return el;
}

function renderClosedSection(groups: SyncedGroupInfo[]): HTMLElement {
  const el = section(t('sectionClosedGroups'));
  if (groups.length === 0) {
    el.appendChild(emptyRow(t('emptyClosedGroups')));
    return el;
  }

  for (const info of groups) {
    const openBtn = makeButton(t('buttonOpen'), () => {
      void openGroup(info.syncId, info.group).then(scheduleRender);
    });
    const deleteBtn = makeButton(
      t('buttonDelete'),
      () => {
        void deleteGroupEverywhere(info.syncId, info.group.title).then(scheduleRender);
      },
      'danger',
    );
    el.appendChild(groupRow(info.group.color, info.group.title, info.group.tabs.length, [openBtn, deleteBtn]));
  }

  return el;
}

browser.storage.onChanged.addListener(() => {
  scheduleRender();
});

const brandVersion = document.getElementById('brand-version');
if (brandVersion !== null) {
  brandVersion.textContent = `v${browser.runtime.getManifest().version}`;
}

const syncNowButton = document.getElementById('sync-now');
if (syncNowButton instanceof HTMLButtonElement) {
  syncNowButton.title = t('syncNowTitle');
  syncNowButton.setAttribute('aria-label', t('syncNowTitle'));
  syncNowButton.addEventListener('click', () => {
    syncNowButton.disabled = true;
    void forceSyncNow()
      .then(scheduleRender)
      .catch((error: unknown) => {
        console.error('Failed to force sync', error);
      })
      .finally(() => {
        syncNowButton.disabled = false;
      });
  });
}

scheduleRender();
