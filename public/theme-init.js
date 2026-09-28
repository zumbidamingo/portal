// Tema antes da primeira pintura: lê a mesma chave que ThemeService e evita o flash do tema errado.
// Ficheiro externo (e não inline no index.html) para a CSP poder proibir scripts inline.
(function () {
  var mode = null;
  try { mode = localStorage.getItem('suaoperacao_theme'); } catch (e) {}
  var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
