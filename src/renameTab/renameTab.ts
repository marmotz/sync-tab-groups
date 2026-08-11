import { t } from '../lib/i18n';
import { applyCustomTitle, setCustomTitle } from '../lib/tabTitle';

const params = new URLSearchParams(window.location.search);
const tabId = Number(params.get('tabId'));
const currentTitle = params.get('title') ?? '';

const promptLabel = document.getElementById('prompt-label');
const input = document.getElementById('title-input');
const form = document.getElementById('rename-form');
const cancelButton = document.getElementById('cancel-button');
const confirmButton = document.getElementById('confirm-button');

if (
  !(promptLabel instanceof HTMLElement) ||
  !(input instanceof HTMLInputElement) ||
  !(form instanceof HTMLFormElement) ||
  !(cancelButton instanceof HTMLButtonElement) ||
  !(confirmButton instanceof HTMLButtonElement)
) {
  throw new Error('renameTab: expected page elements not found');
}

promptLabel.textContent = t('renameTabPrompt');
confirmButton.textContent = t('buttonRename');
cancelButton.textContent = t('buttonCancel');
input.value = currentTitle;
input.focus();
input.select();

cancelButton.addEventListener('click', () => {
  window.close();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.close();
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const newTitle = input.value.trim();
  if (newTitle === '' || Number.isNaN(tabId)) {
    window.close();
    return;
  }

  void setCustomTitle(tabId, newTitle)
    .then(() => applyCustomTitle(tabId, newTitle))
    .finally(() => window.close());
});
