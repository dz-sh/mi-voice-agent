/**
 * Simple async mutex to serialize DID-swapping MIoT operations.
 * Prevents race conditions when parallel tool calls target different devices.
 */
let didLock = Promise.resolve();

export function withDidLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>((r) => { release = r; });
    const prev = didLock;
    didLock = next;
    return prev.then(fn).finally(() => release!());
}
