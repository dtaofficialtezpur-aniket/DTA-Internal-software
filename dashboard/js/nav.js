import { renderTeam } from './team.js';
import { renderFilesPage } from './files.js';

export function showView(view){
  document.querySelectorAll('[data-page]').forEach(function(s){ s.hidden = (s.dataset.page !== view); });
  document.querySelectorAll('.nav-btn').forEach(function(b){
    if (b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  if (view === 'team') renderTeam();
  if (view === 'files') renderFilesPage();
}
