// The wall of dogs behind the opening: each is the avatar an agent would get from an id (see
// avatars.js). They blink now and then, and the button shuffles in new ones.
import { avatarFor } from '/avatars.js';

const wall = document.querySelector('.wall');
if (wall) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COUNT = 220;
  // The same wall for everyone to begin with, so it can be told about: ids from a fixed sequence.
  const idFor = (i) => (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0');
  const randomId = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');

  const cell = (id) => {
    const a = avatarFor(id);
    const el = document.createElement('div');
    el.className = 'av';
    el.style.setProperty('--fill', a.fill);
    el.style.setProperty('--ink', a.ink);
    el.style.setProperty('--tilt', `${a.tilt}deg`);
    const face = document.createElement('span');
    face.textContent = a.face;
    const mouth = document.createElement('span');
    mouth.className = 'm';
    mouth.textContent = a.mouth;
    el.append(face, mouth);
    el.dataset.face = a.face;
    return el;
  };

  const fill = (id) => wall.replaceChildren(...Array.from({ length: COUNT }, (_, i) => cell(id(i))));
  fill(idFor);

  // One dog at a time shuts its eyes for a moment, somewhere on the wall.
  if (!still)
    setInterval(() => {
      if (document.hidden) return;
      const el = wall.children[Math.floor(Math.random() * wall.children.length)];
      const face = el?.firstChild;
      if (!face) return;
      face.textContent = el.dataset.face[0] + '- -' + el.dataset.face[4];
      setTimeout(() => (face.textContent = el.dataset.face), 160);
    }, 220);

  document.querySelector('[data-shuffle]')?.addEventListener('click', () => fill(randomId));
}
