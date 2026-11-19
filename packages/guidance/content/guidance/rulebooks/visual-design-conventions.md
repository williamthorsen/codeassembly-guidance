---
slug: visual-design-conventions
description: 'Visual design of interfaces: marks for the exception, colour as an encoding channel, padding inside bounded containers, alignment, an appearance that follows each element''s role, tags, product identity, and the browser check of a visible change. Consult before writing an artifact page, a prototype, or a mockup, before writing CSS or a UI component, and before finishing or reviewing a change to a visible component.'
delivery: [skill]
version: '1'
---

# Visual design conventions

A reader sees a page's structure through its marks, its spacing, and its alignment before reading its text. These conventions state the principles that hold whatever the style; a taste, such as one colour scheme over another, does not belong here. They apply to a prototype or a mockup exactly as they apply to a released interface, and {rulebook:accessibility-conventions} sets the floors beneath them.

When a project names its own design system, that system takes precedence where the two conflict.

## Marks

A mark, such as bold, italics, a colour, a highlight, or a badge, is for the exception, and the common state is unmarked. A mark that covers most of a text distinguishes nothing, and the reader can no longer find what it was meant to set apart. The glanceable-state rule of {rulebook:accessibility-conventions} names the states that a list marks. Example: ❌ Every term in a paragraph is bold. ✅ Only the term that the paragraph defines is bold.

## Colour as encoding

Colour is an encoding channel: Use it to tell kinds and states apart, rather than leaving weight and style to do all the work. Pair each colour with a second cue, as the glanceable-state rule of {rulebook:accessibility-conventions} requires. Example: ❌ Errors, warnings, and notes differ only in weight and italics. ✅ Each has a colour and an icon of its own.

## Spacing

Text never touches the edge of a container that has a visible boundary, such as a border or a fill: Padding separates the text from every edge. A container without a visible boundary does not have an edge that the text could touch. Example: ❌ A badge's label runs into its border. ✅ The label has padding on every side.

## Alignment

Every block aligns with an edge or an axis of another block on the page. A block does not float in the vertical middle of a region that it does not fill: It starts where the region's content starts, and an empty state sits where the content that it replaces would begin. A dialog centered in the viewport over the page is not such a block. Example: ❌ An empty-list message floats in the middle of a tall panel, aligned with nothing. ✅ The message starts at the top of the panel, on the list's left edge.

## Roles

The element follows semantics, and the appearance follows the role:

- **Link.** An `<a>` navigates, and a text link looks like a link: a colour that sets it apart from the text around it, with a cue beyond colour, such as an underline.
- **Navigation item.** An item of a navigation bar or a menu looks like navigation: It sits in the navigation region, and the item for the current view is marked.
- **Button.** A `<button>` acts, and it looks like a button, as the interaction-state rules of {rulebook:accessibility-conventions} state.
- **Tag.** A value that tags or classifies an item, such as a status or a category, looks like a tag: a compact shape with a fill or a border, set apart from the body text.

Example: ❌ "View details" and "Delete" are both blue underlined text. ✅ "View details" is a link to the detail view, and "Delete" is a button.

## Identity

The product's name and a link to its home view are visible on every view. A product does not ship a template's placeholder identity, such as the template's favicon.

## Checking in a browser

Check every change to a visible component in a browser before reporting it finished or reviewed, alongside the check in {rulebook:accessibility-conventions}. On each new or changed view, confirm each of these:

- The text in each bordered or filled container has padding on every side.
- Each block aligns with another block, and each block that does not fill its region starts where the region's content starts.
- Marks fall on exceptions only.
- Each link, navigation item, button, and tag looks like its role.
- The product's name and home link are visible, and the favicon is the product's own.

A reading of the diff does not replace this check: Padding and alignment show only once the page renders. When a browser is not available, report that the check did not run and name the views that it would have covered. Never report it as passed.
