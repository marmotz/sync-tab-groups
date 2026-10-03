# Sync Tab Groups

Firefox extension that synchronizes tab groups, and the tabs they contain, across your devices.

Share a tab group from one Firefox, and it shows up on your other Firefox instances, where you can open it, keep it
live-synced, or close it without losing it.

## Features

- Share any local tab group: its title, color, collapsed state and tab list (URL, title, custom title, order) are synced.
- Live two-way sync: while a synced group is open on several devices, adding, removing or reordering tabs, renaming the
  group or changing its color on one device is applied on the others.
- Open a synced group on a device where it is not open yet. Closing it there keeps it available in the cloud.
- Delete a synced group everywhere with one click.
- Same-name conflict handling: opening a synced group when a local group has the same name (case and surrounding spaces
  ignored) offers to rename the local group, keep the local tabs, keep the cloud tabs, or merge both.
- "Sync now" button to force a local catch-up.
- Custom tab titles: right-click a tab, then "Rename tab" (and "Reset title" to undo). Synced with the group, see the
  FAQ.
- English and French interface.

## Requirements

- Firefox 140 or later (desktop).
- A Firefox (Mozilla) account with Sync enabled, and "Add-ons" ticked in the Sync settings (`about:preferences#sync`).
  Without it, nothing leaves the device.

## Usage

Open the extension popup (toolbar button). It has three sections:

| Section                     | Content                                                | Actions       |
|-----------------------------|--------------------------------------------------------|---------------|
| Local groups                | Tab groups of this device that are not synced          | Share         |
| Synced groups (open here)   | Synced groups currently open on this device            | Close, Delete |
| Synced groups (closed here) | Synced groups available in the cloud but not open here | Open, Delete  |

- **Share** turns a local group into a synced group.
- **Close** closes the group on this device only. It stays synced and can be reopened anywhere.
- **Delete** removes the group from the sync on every device. On devices where it is open, the tabs stay open as a plain
  local group.
- **Open** recreates the group (tabs, title, color) on this device and keeps it linked to the sync.

## How it works

- Each synced group is stored as one item (`group:<id>`) in `browser.storage.sync`, the WebExtension storage that
  Firefox Sync replicates through your Mozilla account. No server of ours is involved, and the extension declares that
  it collects no data.
- Each device keeps, in `browser.storage.local` (never synced): a random device id, the mapping between local group ids
  and synced ids, and the last synced snapshot of each group.
- Local changes (tab created, moved, closed, navigated, group renamed or recolored) are detected through the browser tab
  and tab group events, debounced by 500 ms, compared to the last snapshot, and written to `storage.sync` only if
  something actually changed.
- Incoming changes are detected through `storage.onChanged`. The extension ignores its own writes (device id check),
  then reconciles the open local group with the remote one: tabs are matched by URL, missing ones are created, obsolete
  ones are closed, order is restored, then title, color and collapsed state are applied.

## FAQ

### When does the auto-sync take place in the background?

On the sending side, about half a second after a change to a shared group (tab opened, closed, moved or navigated, group
renamed, recolored, collapsed). The write goes to Firefox's synced storage immediately after that.

On the receiving side, as soon as Firefox Sync delivers the new data to the device, the extension applies it to the
group if it is open there. There is no polling loop in the extension itself.

### Is there a bi-directional sync?

Yes. Any device where a synced group is open can modify it, and the change is propagated to the others. There is no
"master" device.

There is no merge of concurrent edits though: it is last write wins. If two devices edit the same group at nearly the
same time, the version that Firefox Sync ends up keeping is applied everywhere, and the other edit is overwritten.

### Where is the sync store? Is that the Mozilla account?

Yes. Data is stored in `browser.storage.sync`, which Firefox replicates through your Mozilla account via Firefox Sync.
You must be signed in and have "Add-ons" enabled in the Sync settings. The extension has no server and no account of its
own.

Limits imposed by Firefox on `storage.sync`: 100 KB in total, 8 KB per item, 512 items. Since one group is one item, a
group with a very large number of tabs or very long URLs can exceed 8 KB, in which case the write is rejected by the
browser and that group stops syncing. Splitting it in two groups works around it. Firefox for Android does not sync
extension storage, so this extension needs desktop Firefox.

### With 2 clients synced, how long does it take to see a change on the other client?

The extension adds roughly half a second. The rest is up to Firefox Sync, which the extension does not control. Per MDN,
Firefox syncs extension storage periodically (about every 10 minutes) or immediately when you trigger "Sync Now" from
the Mozilla account menu or Settings > Sync. In practice, expect anywhere from a few seconds to about ten minutes.

Note that the "Sync now" button of the extension popup does not ask Firefox to fetch from the server. It re-applies, on
this device, the data Firefox already received (useful if the background script missed an update). To pull data faster,
use Firefox's own "Sync Now" on the receiving device (and on the sending one if needed).

### What happens when a client changes tabs on a synced group?

Adding, closing, moving or navigating a tab inside a shared group updates the group's tab list in the sync. On the other
devices where the group is open, tabs are matched by URL: new URLs are opened in the group, URLs that are gone are
closed, and the order is rearranged to match.

Notes:

- Tabs are identified by URL. Navigating a tab to another page counts as removing the old URL and adding the new one.
- Dragging a tab out of a group removes it from the synced group. Closing or emptying the group tab by tab (down to the
  last tab) deletes the group from the sync everywhere, since an empty group cannot be reopened.
- Closing the whole group in one action (the popup "Close" button, or the native "Close group" action) only closes it on
  this device: the group remains synced and can be reopened.

### What happens if a client renames a tab group?

The new title (as well as the color and the collapsed state) is synced, and applied to the group on the other devices
where it is open. The synced group keeps its identity, so it does not create a duplicate.

### What happens if I rename a single tab?

The custom tab title (right-click on a tab, then "Rename tab") is stored in the browser session and re-applied by a
content script. When the tab belongs to a synced group, the custom title is synced with the group: other devices where
the group is open apply it to the matching tab, including tabs they create from the sync.

Using "Reset title" on one device clears the custom title on the others too. Since the real page title was overwritten in
the page, the tab is reloaded to get it back. Tabs outside a synced group keep their custom title local to the device.

### What if a group with the same name already exists on the device where I open a synced group?

You get a choice: rename the local group (and open the synced one separately), keep your local tabs (local content
replaces the cloud one), keep the cloud tabs (local tabs are replaced), or merge (local tabs first, then missing cloud
tabs, de-duplicated by URL). The chosen result is pushed to the sync.

### Are tabs outside of groups synced?

Only tabs inside tab groups are synced. Tabs outside any group are ignored.

## Development

Requirements: [Bun](https://bun.sh) and Node.js.

```bash
bun install
bun run dev              # vite build in watch mode
bun run web-ext:run      # build, then launch Firefox with the extension loaded
bun run test             # unit tests (vitest)
bun run typecheck        # tsc --noEmit
bun run build:extension  # lint + package the extension and the source archive in builds/
```

Source layout:

- `src/background`: event listeners (local changes, remote changes, tab rename menu).
- `src/lib`: sync model, storage access, reconciliation logic, group actions.
- `src/popup`: popup UI.
- `src/content`, `src/renameTab`: custom tab title (content script and rename window).
- `public`: manifest, icons, translations (`_locales`).
- `tests`: vitest unit tests.

## License

See [LICENSE](LICENSE).
