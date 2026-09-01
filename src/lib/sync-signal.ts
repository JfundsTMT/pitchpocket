// Minimal one-listener event bus so the data layer (fixtures, debriefs,
// profile) can announce "something changed locally" without importing the
// sync engine — which imports the data layer, and would otherwise be a
// circular dependency.

type Listener = () => void;

let listener: Listener | null = null;
let pendingWhileUnsubscribed = false;

export function requestPush(): void {
  if (listener) {
    listener();
  } else {
    pendingWhileUnsubscribed = true;
  }
}

export function onPushRequested(next: Listener): void {
  listener = next;
  if (pendingWhileUnsubscribed) {
    pendingWhileUnsubscribed = false;
    next();
  }
}
