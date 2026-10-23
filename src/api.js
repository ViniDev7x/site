export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let data; try { data = await response.json(); } catch { throw new Error('Não foi possível comunicar com a plataforma. Tente novamente ou contate o suporte.'); }
  if (!response.ok) throw new Error(data.error || 'Não foi possível completar a solicitação.');
  return data;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body });
