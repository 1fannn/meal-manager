document.querySelectorAll('[data-share-meal]').forEach((button) => {
  button.addEventListener('click', async () => {
    const name = button.dataset.name;
    const location = button.dataset.location;
    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);
    const text = name + '\nAddress / Location: ' + location + '\nMap: ' + mapUrl;

    button.disabled = true;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      window.alert('Copied! Paste and share with your friends.');
    } catch (error) {
      window.prompt('Could not copy automatically. Copy this text, then paste and share with your friends:', text);
    } finally {
      button.disabled = false;
    }
  });
});
