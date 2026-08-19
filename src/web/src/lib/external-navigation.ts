/** Centraliza navegação externa para que o redirect do Checkout seja testável. */
export function redirectToExternalUrl(url: string): void {
  window.location.assign(url);
}
