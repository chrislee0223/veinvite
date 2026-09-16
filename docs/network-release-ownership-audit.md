# Network release ownership baseline

This note records the release-stabilization ownership boundaries reviewed before launch. It is intentionally descriptive; it does not redesign Network behavior.

- V37 / the underlying QA canvas owns the canary camera transform and raw pan/pinch zoom.
- V49 retains the all-fingers-up pinch bridge that prevents a surviving finger from resuming stale one-finger pan state.
- V50 is the canary owner for pinch-to-enter and pinch-to-parent navigation thresholds.
- V52 owns ordinary person-node long hold / free-position drag support and geometry reconciliation; it must not own pinch/wheel network navigation.
- V53 owns Available-slot long hold / free-position drag support.
- V57 is the visible authoritative person/group edge renderer; older edge paths remain hidden compatibility surfaces.
- V63 is the final unified person-node transform/position layer and pinch guard for node drag state.
- V64 owns iOS native-selection/gesture protection and interrupted-pointer recovery.
- V65/V70/V71 own localization/presentation/root-identity polish, not camera or node navigation.
- AppGuide owns the Network-lifetime page-zoom guard and restores viewport/touch state on unmount.
- The real-data AppNetwork remains a separate implementation and is not refactored into the canary chain during this release-stabilization pass.

## Cleanup in this pass

V46 keeps its reviewed viewport/fit/zoom-presentation and slot-line overlay responsibilities. Its retired detached person-node drag-preview subsystem was removed because later layers already own the visible drag behavior, while V47 explicitly hid the old V46 ghost. Leaving that retired subsystem active caused duplicate pointer capture/listeners and unnecessary DOM ghost creation even though the ghost could never be shown.

## Release rule

Do not add another canary wrapper to solve gesture ownership. Change the existing owner, preserve current thresholds unless a behavior change is explicitly reviewed, and keep Home/reward/claim logic outside Network release patches.
