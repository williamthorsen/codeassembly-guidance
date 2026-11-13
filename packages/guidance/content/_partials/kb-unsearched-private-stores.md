`unsearchedPrivateStores` names each registered `private` store that the recall did not search. A private store may contain notes that no other store has, so a recall that skipped one is partial. Whenever the list is not empty, whether or not candidates were returned, tell the user that the recall was partial and name each store by its `name`:

- For a store that a `path does not exist` warning also names, say that its path needs fixing: Neither flag can search a store whose directory is absent.
- For every other store, name the flag that would include it: `--store <name>` for that store alone, or `--all-kbs` for every registered store.

In an empty result, never report that nothing was found without this disclosure.
