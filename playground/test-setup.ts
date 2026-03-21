import { Window } from 'happy-dom';

const window = new Window();

Object.defineProperty(globalThis, 'window', {
  value: window,
  configurable: true,
  writable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: window.document,
  configurable: true,
  writable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: window.localStorage,
  configurable: true,
  writable: true,
});