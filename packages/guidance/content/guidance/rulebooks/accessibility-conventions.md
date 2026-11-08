---
slug: accessibility-conventions
description: 'Accessibility of interfaces: usability before style, contrast and size floors for text, the placement, model, and states of interactive controls, the states for which a reader scans a list, and the browser check of a visible change. Consult before writing an artifact page, a prototype, or a mockup, before designing or placing a control that opens a region or toggles a setting, before designing or reviewing a list, a table, or another surface of repeated items, before defining or changing colour tokens, before writing CSS or a UI component, and before finishing or reviewing a change to a visible component.'
delivery: [skill]
version: '5'
---

# Accessibility conventions

Make an interface usable before making it look refined, and when a style choice conflicts with readability or usability, choose usability whatever the aesthetic: "Subtle" and "refined" never justify small or faint text. These conventions apply to a prototype or a mockup exactly as they apply to a released interface.

The standard is WCAG 2.2 AA. This rulebook restates only the values that an agent checks while authoring and the rules that WCAG does not set; for everything else, follow WCAG.

## Text legibility

- **Contrast.** Every text colour meets SC 1.4.3 against each surface on which it is set, in each theme that the page defines: 4.5:1, or 3:1 for large text (at least 24px, or at least 18.7px bold).
- **Size.** Body text is at least 14px, and secondary text (captions, counts, states, hints) at least 12px. WCAG does not set either floor.
- **Tiers.** Use two text colours, primary and secondary. Add a third only if it meets the same contrast floor.

Check contrast whenever colour tokens are defined or changed. Compute the WCAG contrast ratio of each text token against each surface token on which it is used, in each theme, compositing any translucent colour or `opacity` over its surface first. Report every failing pair with its ratio, and fix it before presenting the page.

## Designing controls

- **Named model.** Before designing an affordance, name the established model that the feature most resembles, such as a browser's developer tools, an editor's side panel, or a panel that the product already has, and follow it. Depart from the model only for a reason, and record the reason wherever the design is recorded. Example: An activity drawer follows the editor side-panel model.
- **Placement.** A control that opens or closes a region sits at that region's edge or in a persistent toolbar, never in an unrelated group of actions. Example: ❌ An "Activity" button among the page header's actions opens a drawer on the right. ✅ The toggle sits at the right end of the toolbar, on the drawer's side.

## Glanceable state

A state for which a reader scans a list, a table, or another surface of repeated items, such as expired, failing, selected, in progress, or due soon, is visible without reading each item. Mark it by one or more of these means:

- **Colour with a second cue.** A colour paired with a cue that does not rely on colour, such as an icon, a badge, or a weight, per SC 1.4.1.
- **Symbol.** An icon or a badge beside each item in the state.
- **Grouping.** A section or a divider that sets the items in the state apart from the rest.
- **Order.** A sort that brings the items in the state to the top.

Text alone does not meet the rule, even in a column of its own: The reader still reads each cell to find the items in the state. A restraint on colour, such as a decision to keep a page calm, governs decoration and never such a state, and a design decision or a prototype verdict that hides one is a defect. Example: ❌ An expiry column that reads "Expired 1 day ago" and "In 200 days" in one style. ✅ Each expired token shows a red badge with a warning icon, and the expired tokens sort first.

## Interaction states

Every element that responds to a click or a key shows that it does:

- **Pointer.** The cursor is a pointer over it.
- **Hover.** Its appearance changes while the pointer is over it.
- **Focus.** A visible indicator marks it while it has keyboard focus, per SC 2.4.7, and the indicator meets the 3:1 non-text contrast of SC 1.4.11 against its surface.

A button outside a toolbar also looks like a button at rest: It has a border or a fill that meets the 3:1 contrast of SC 1.4.11 against its surface. Only a button inside a toolbar may be borderless text.

A disabled element, whether disabled by the native attribute or by `aria-disabled`, shows neither the hover state nor the pointer.

A control that toggles also shows its on state at rest, by a cue that does not rely on colour alone (SC 1.4.1) and that meets the 3:1 contrast of SC 1.4.11. It exposes the state as `aria-expanded` when it shows or hides a region, and as `aria-pressed` when it switches a setting. Its label names what it governs and stays the same in both states. Example: ❌ "Show activity", which becomes "Hide activity". ✅ "Activity", with `aria-expanded` and a pressed style while the drawer is open.

Put the states in a base style or a shared component rather than setting them at each call site. Do not rely on a framework's or a reset's defaults: Some remove the pointer from a button.

## Checking in a browser

Check every change to a visible component in a browser before reporting it finished or reviewed. Open the page, then hover over and tab through each new or changed interactive element, and confirm the three states above, or their absence on a disabled element. Toggle each control that toggles, and confirm its on state and its off state. Confirm that each button outside a toolbar has its border or fill at rest, and scan each new or changed list to confirm that its scanned states are visible without reading each item. A test that renders HTML, or a reading of the diff, does not replace this check: Neither shows what the element looks like under the pointer or with focus.

When a browser is not available, report that the check did not run and name the elements that it would have covered. Never report it as passed.
