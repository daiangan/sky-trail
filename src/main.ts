import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.innerHTML = `
    <main class="boot">
      <h1 class="boot__title">SkyTrail</h1>
      <p class="boot__subtitle">Astrophotography capture progress, in the browser.</p>
      <p class="boot__phase">Phase 0 &middot; project scaffold</p>
    </main>
  `;
}
