// Short notices under the top panel: a run's time, a speed camera's fine.
// Each shows for a few seconds; the newest on top, at most three at once.
export function setupToasts(container) {
  const list = document.createElement('div');
  list.className = 'toasts';
  list.setAttribute('aria-live', 'polite');
  container.append(list);
  return {
    // `tone`: 'record' (green), 'fine' (red) or none.
    show({ label, shown, note = '', tone = '' }, seconds = 4.5) {
      const toast = document.createElement('div');
      toast.className = `toast ${tone}`;
      const b = document.createElement('b');
      b.textContent = label;
      const value = document.createElement('span');
      value.className = 'toast-value';
      value.textContent = shown;
      toast.append(b, value);
      if (note) {
        const small = document.createElement('small');
        small.textContent = note;
        toast.append(small);
      }
      list.prepend(toast);
      while (list.children.length > 3) list.lastChild.remove();
      setTimeout(() => toast.classList.add('leaving'), seconds * 1000);
      setTimeout(() => toast.remove(), seconds * 1000 + 400);
      return toast;
    },
  };
}
