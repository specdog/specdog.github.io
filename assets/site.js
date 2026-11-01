(() => {
  async function copyBlock(button) {
    const pre = button.closest('.code-wrap')?.querySelector('pre');
    if (!pre) return;
    try {
      await navigator.clipboard.writeText(pre.textContent);
      button.textContent = 'Copied';
      button.setAttribute('aria-label', 'Code copied');
    } catch {
      button.textContent = 'Select code';
      button.setAttribute('aria-label', 'Clipboard unavailable; select the code to copy');
    }
    setTimeout(() => { button.textContent = 'Copy'; button.setAttribute('aria-label', 'Copy code'); }, 2000);
  }
  window.copyBlock = copyBlock;
  document.querySelectorAll('.page pre').forEach(pre => {
    let wrap = pre.parentElement;
    if (!wrap.classList.contains('code-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      pre.before(wrap);
      wrap.append(pre);
    }
    let button = wrap.querySelector('.copy-btn');
    if (!button) {
      button = document.createElement('button');
      button.className = 'copy-btn';
      button.type = 'button';
      button.addEventListener('click', () => copyBlock(button));
      wrap.append(button);
    }
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
  });
})();
