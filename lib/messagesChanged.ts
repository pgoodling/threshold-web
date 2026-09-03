// "Something changed the read state of a message" — announced once, heard by
// the shell.
//
// The unread badge lives in the studio shell; the things that clear it live in
// Messages, in the client card, and in the appointment modal — two of them
// nested a couple of components deep, in two different parents. Threading a
// callback down both chains would put a prop about badge counting into the
// signature of every component in between, none of which have anything to do
// with it.
//
// A DOM event is enough. Everything here is one page in one tab, the payload is
// nothing, and the shell recounts from the database rather than trusting a
// number it was handed — so a missed event costs at most the sixty-second
// refresh that was already there, and a duplicate event costs one query.

const TOPIC = "threshold:messages-changed";

/** Call after anything that marks messages read or archived. */
export function messagesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TOPIC));
}

/** Subscribe. Returns the unsubscribe, shaped for a useEffect cleanup. */
export function onMessagesChanged(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TOPIC, fn);
  return () => window.removeEventListener(TOPIC, fn);
}
