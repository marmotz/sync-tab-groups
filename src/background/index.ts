import { registerLocalListeners } from './localListeners';
import { registerRemoteListener } from './remoteListener';
import { registerTabRenameMenu } from './tabRenameMenu';

registerLocalListeners();
registerRemoteListener();
registerTabRenameMenu();
