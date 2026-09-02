# WS0 human desktop + mobile baseline note

Status: **research-enabling note, not architecture**

This branch is derived exactly from the preserved interactive two-client control at `6e5ac5a47b714815768bd8a080f214968d5d60bc`.

Purpose: remove physical access to a second desktop as a blocker for the first two-human WS0 play gate without changing the qualified physics/network model.

The mobile-enabling change is intentionally presentation/input-only:
- the existing `public/world0-two-client/app.js` remains unchanged;
- touch buttons translate pointer down/up into the same Arrow-key transitions already consumed by the existing client;
- therefore keyboard and touch feed the same existing normalized `x/z` intent path;
- no physics cadence, player mechanics, remote causality, snapshots, reconciliation or authority semantics change.

The dedicated browser gate uses a mobile-sized second Chrome session, drives it through real WebDriver touch pointer actions, and requires the resulting mobile cause to move authoritative shared props while a passive desktop local world reproduces that consequence through delayed `peer_input`.

This adapter is deliberately minimal and disposable. It does not select final mobile controls, camera, HUD or input architecture.
