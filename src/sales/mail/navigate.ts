/** Leaves SalesOS for Google's consent page. A module of its own so tests can see where it would go. */
export const leaveTo = (url: string): void => { window.location.assign(url) }
