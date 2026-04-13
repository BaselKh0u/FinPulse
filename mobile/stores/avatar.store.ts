let listeners: Array<(uri: string | null) => void> = [];
let currentUri: string | null = null;

export function getAvatarUri(): string | null {
  return currentUri;
}

export function setAvatarUri(uri: string | null) {
  currentUri = uri;
  listeners.forEach((fn) => fn(uri));
}

export function subscribeAvatarUri(fn: (uri: string | null) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
